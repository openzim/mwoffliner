import * as backoff from 'backoff'
import { config } from './config.js'
import { contains } from './util/index.js'
import { Readable } from 'stream'
import deepmerge from 'deepmerge'
import * as domino from 'domino'
import { default as imagemin } from 'imagemin'
import imageminAdvPng from 'imagemin-advpng'
import type { BackoffStrategy } from 'backoff'
import axios, { AxiosRequestConfig } from 'axios'
import { default as imageminPngquant } from 'imagemin-pngquant'
import imageminGifsicle from 'imagemin-gifsicle'
import imageminJpegoptim from 'imagemin-jpegoptim'
import imageminWebp from 'imagemin-webp'
import sharp from 'sharp'
import http from 'http'
import https from 'https'

import { normalizeMwResponse, DB_ERROR, WEAK_ETAG_REGEX, stripHttpFromUrl, isBitmapImageMimeType, isImageUrl, getMimeType, isWebpCandidateImageMimeType } from './util/index.js'
import S3 from './S3.js'
import * as logger from './Logger.js'
import MediaWiki, { QueryOpts } from './MediaWiki.js'
import ApiURLDirector from './util/builders/url/api.director.js'
import basicURLDirector from './util/builders/url/basic.director.js'
import urlHelper from './util/url.helper.js'

const imageminOptions = new Map()
imageminOptions.set('default', new Map())
imageminOptions.set('webp', new Map())

imageminOptions.get('default').set('image/png', {
  plugins: [(imageminPngquant as any)({ speed: 3, strip: true, dithering: 0 }), imageminAdvPng({ optimizationLevel: 4, iterations: 5 })],
})
imageminOptions.get('default').set('image/jpeg', {
  plugins: [imageminJpegoptim({ max: 60, stripAll: true })],
})
imageminOptions.get('default').set('image/gif', {
  plugins: [imageminGifsicle({ optimizationLevel: 3, colors: 64 })],
})
imageminOptions.get('webp').set('image/png', {
  plugins: [imageminWebp({ quality: 50, method: 6 })],
})
imageminOptions.get('webp').set('image/jpeg', {
  plugins: [imageminWebp({ quality: 50, method: 6 })],
})

interface DownloaderOpts {
  uaString: string
  speed: number
  reqTimeout: number
  optimisationCacheUrl: string
  s3?: S3
  webp: boolean
  backoffOptions?: BackoffOptions
}

interface BackoffOptions {
  strategy: BackoffStrategy
  failAfter: number
  retryIf: (error?: any) => boolean
  backoffHandler: (number: number, delay: number, error?: any) => void
}

export const defaultStreamRequestOptions: AxiosRequestConfig = {
  headers: {
    accept: 'application/octet-stream',
    'cache-control': 'public, max-stale=86400',
    'accept-encoding': 'gzip, deflate',
    'user-agent': config.userAgent,
  },
  responseType: 'stream',
  timeout: config.defaults.requestTimeout,
  method: 'GET',
}

/**
 * Downloader is a class providing content retrieval functionalities for both Mediawiki and S3 remote instances.
 */
class Downloader {
  public loginCookie = ''
  public readonly speed: number
  public baseUrl: string
  public baseUrlForMainPage: string
  public cssDependenceUrls: KVS<boolean> = {}
  public readonly webp: boolean = false
  public readonly requestTimeout: number
  public arrayBufferRequestOptions: AxiosRequestConfig
  public jsonRequestOptions: AxiosRequestConfig
  public streamRequestOptions: AxiosRequestConfig

  private readonly uaString: string
  private activeRequests = 0
  private maxActiveRequests = 1
  private readonly backoffOptions: BackoffOptions
  private readonly optimisationCacheUrl: string
  private s3: S3
  private apiUrlDirector: ApiURLDirector

  constructor({ uaString, speed, reqTimeout, optimisationCacheUrl, s3, webp, backoffOptions }: DownloaderOpts) {
    this.uaString = uaString
    this.speed = speed
    this.maxActiveRequests = speed * 10
    this.requestTimeout = reqTimeout
    this.loginCookie = ''
    this.optimisationCacheUrl = optimisationCacheUrl
    this.webp = webp
    this.s3 = s3
    this.apiUrlDirector = new ApiURLDirector(MediaWiki.apiUrl.href)

    this.backoffOptions = {
      strategy: new backoff.ExponentialStrategy(),
      failAfter: 7,
      retryIf: (err: any) => err.code === 'ECONNABORTED' || ![400, 403, 404].includes(err.response?.status),
      backoffHandler: (number: number, delay: number) => {
        logger.info(`[backoff] #${number} after ${delay} ms`)
      },
      ...backoffOptions,
    }

    this.arrayBufferRequestOptions = {
      // HTTP agent pools with 'keepAlive' to reuse TCP connections, so it's faster
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true }),

      headers: {
        'cache-control': 'public, max-stale=86400',
        'user-agent': this.uaString,
        cookie: this.loginCookie,
      },
      responseType: 'arraybuffer',
      timeout: this.requestTimeout,
      method: 'GET',
      validateStatus(status) {
        return (status >= 200 && status < 300) || status === 304
      },
    }

    this.jsonRequestOptions = {
      // HTTP agent pools with 'keepAlive' to reuse TCP connections, so it's faster
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true }),

      headers: {
        accept: 'application/json',
        'cache-control': 'public, max-stale=86400',
        'accept-encoding': 'gzip, deflate',
        'user-agent': this.uaString,
        cookie: this.loginCookie,
      },
      responseType: 'json',
      timeout: this.requestTimeout,
      method: 'GET',
    }

    this.streamRequestOptions = {
      // HTTP agent pools with 'keepAlive' to reuse TCP connections, so it's faster
      ...defaultStreamRequestOptions,
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true }),

      headers: {
        ...defaultStreamRequestOptions.headers,
        'user-agent': this.uaString,
        cookie: this.loginCookie,
      },
      timeout: this.requestTimeout,
    }
  }

  public async setBaseUrls(forceRender = null) {
    if (!forceRender) {
      //* Objects order in array matters!
      this.baseUrl = basicURLDirector.buildDownloaderBaseUrl([
        { condition: await MediaWiki.hasWikimediaMobileRestApi(), value: MediaWiki.mobileRestApiUrl.href },
        { condition: await MediaWiki.hasWikimediaDesktopRestApi(), value: MediaWiki.desktopRestApiUrl.href },
        { condition: await MediaWiki.hasVisualEditorApi(), value: MediaWiki.visualEditorApiUrl.href },
      ])

      //* Objects order in array matters!
      this.baseUrlForMainPage = basicURLDirector.buildDownloaderBaseUrl([
        { condition: await MediaWiki.hasWikimediaDesktopRestApi(), value: MediaWiki.desktopRestApiUrl.href },
        { condition: await MediaWiki.hasVisualEditorApi(), value: MediaWiki.visualEditorApiUrl.href },
        { condition: await MediaWiki.hasWikimediaMobileRestApi(), value: MediaWiki.mobileRestApiUrl.href },
      ])
    } else {
      switch (forceRender) {
        case 'WikimediaDesktop':
          if (MediaWiki.hasWikimediaDesktopRestApi()) {
            this.baseUrl = MediaWiki.desktopRestApiUrl.href
            this.baseUrlForMainPage = MediaWiki.desktopRestApiUrl.href
            break
          }
          break
        case 'VisualEditor':
          if (MediaWiki.hasVisualEditorApi()) {
            this.baseUrl = MediaWiki.visualEditorApiUrl.href
            this.baseUrlForMainPage = MediaWiki.visualEditorApiUrl.href
            break
          }
          break
        default:
          throw new Error('Unable to find specific API end-point to retrieve article HTML')
      }
    }
    logger.log('Base Url: ', this.baseUrl)
    logger.log('Base Url for Main Page: ', this.baseUrlForMainPage)

    if (!this.baseUrl || !this.baseUrlForMainPage) throw new Error('Unable to find appropriate API end-point to retrieve article HTML')
  }

  public removeEtagWeakPrefix(etag: string): string {
    return etag && etag.replace(WEAK_ETAG_REGEX, '')
  }

  public query(): KVS<any> {
    return this.getJSON(this.apiUrlDirector.buildSiteInfoQueryURL())
  }

  public async getArticleDetailsIds(articleIds: string[], shouldGetThumbnail = false): Promise<QueryMwRet> {
    let continuation: ContinueOpts
    let finalProcessedResp: QueryMwRet

    while (true) {
      const queryOpts: KVS<any> = {
        ...(await this.getArticleQueryOpts(shouldGetThumbnail, true)),
        titles: articleIds.join('|'),
        ...((await MediaWiki.hasCoordinates(this)) ? { colimit: 'max' } : {}),
        ...(MediaWiki.getCategories
          ? {
              cllimit: 'max',
              clshow: '!hidden',
            }
          : {}),
        ...(continuation || {}),
      }

      const reqUrl = this.apiUrlDirector.buildQueryURL(queryOpts)

      const resp = await this.getJSON<MwApiResponse>(reqUrl)

      Downloader.handleMWWarningsAndErrors(resp)

      let processedResponse = resp.query ? normalizeMwResponse(resp.query) : {}
      if (resp.continue) {
        continuation = resp.continue
        finalProcessedResp = finalProcessedResp === undefined ? processedResponse : deepmerge(finalProcessedResp, processedResponse)
      } else {
        if (MediaWiki.getCategories) {
          processedResponse = await this.setArticleSubCategories(processedResponse)
        }
        finalProcessedResp = finalProcessedResp === undefined ? processedResponse : deepmerge(finalProcessedResp, processedResponse)
        break
      }
    }

    return finalProcessedResp
  }

  public async getArticleDetailsNS(ns: number, gapcontinue = ''): Promise<{ gapContinue: string; articleDetails: QueryMwRet }> {
    let queryContinuation: QueryContinueOpts
    let finalProcessedResp: QueryMwRet
    let gCont: string = null

    while (true) {
      const queryOpts: KVS<any> = {
        ...(await this.getArticleQueryOpts()),
        ...((await MediaWiki.hasCoordinates(this)) ? { colimit: 'max' } : {}),
        ...(MediaWiki.getCategories
          ? {
              cllimit: 'max',
              clshow: '!hidden',
            }
          : {}),
        rawcontinue: 'true',
        generator: 'allpages',
        gapfilterredir: 'nonredirects',
        gaplimit: 'max',
        gapnamespace: String(ns),
        gapcontinue,
      }

      if (queryContinuation) {
        queryOpts.cocontinue = queryContinuation?.coordinates?.cocontinue ?? queryOpts.cocontinue
        queryOpts.clcontinue = queryContinuation?.categories?.clcontinue ?? queryOpts.clcontinue
        queryOpts.picontinue = queryContinuation?.pageimages?.picontinue ?? queryOpts.picontinue
        queryOpts.rdcontinue = queryContinuation?.redirects?.rdcontinue ?? queryOpts.rdcontinue
      }

      const reqUrl = this.apiUrlDirector.buildQueryURL(queryOpts)

      const resp = await this.getJSON<MwApiResponse>(reqUrl)
      Downloader.handleMWWarningsAndErrors(resp)

      let processedResponse = normalizeMwResponse(resp.query)

      gCont = resp['query-continue']?.allpages?.gapcontinue ?? gCont

      const queryComplete = Object.keys(resp['query-continue'] || {}).filter((key) => key !== 'allpages').length === 0

      if (!queryComplete) {
        queryContinuation = resp['query-continue']

        finalProcessedResp = finalProcessedResp === undefined ? processedResponse : deepmerge(finalProcessedResp, processedResponse)
      } else {
        if (MediaWiki.getCategories) {
          processedResponse = await this.setArticleSubCategories(processedResponse)
        }

        finalProcessedResp = finalProcessedResp === undefined ? processedResponse : deepmerge(finalProcessedResp, processedResponse)
        break
      }
    }

    return {
      articleDetails: finalProcessedResp,
      gapContinue: gCont,
    }
  }

  public async getArticle(
    webp: boolean,
    _moduleDependencies: any,
    articleId: string,
    articleDetailXId: RKVS<ArticleDetail>,
    articleRenderer,
    articleUrl,
    dump,
    articleDetail?: ArticleDetail,
    isMainPage?: boolean,
  ): Promise<any> {
    logger.info(`Getting article [${articleId}] from ${articleUrl}`)

    const data = await this.getJSON<any>(articleUrl)
    if (data.error) {
      throw data.error
    }

    return articleRenderer.render({
      data,
      webp,
      _moduleDependencies,
      articleId,
      articleDetailXId,
      articleDetail,
      isMainPage,
      dump,
    })
  }

  public async getJSON<T>(_url: string): Promise<T> {
    const url = urlHelper.deserializeUrl(_url)
    await this.claimRequest()
    return new Promise<T>((resolve, reject) => {
      this.backoffCall(this.getJSONCb, url, (err: any, val: any) => {
        this.releaseRequest()
        if (err) {
          const httpStatus = err.response && err.response.status
          logger.warn(`Failed to get [${url}] [status=${httpStatus}]`)
          reject(err)
        } else {
          resolve(val)
        }
      })
    })
  }

  public async downloadContent(_url: string, retry = true): Promise<{ content: Buffer | string; responseHeaders: any }> {
    if (!_url) {
      throw new Error(`Parameter [${_url}] is not a valid url`)
    }
    const url = urlHelper.deserializeUrl(_url)

    await this.claimRequest()

    try {
      return await new Promise((resolve, reject) => {
        const cb = (err: any, val: any) => {
          if (err) {
            reject(err)
          } else {
            resolve(val)
          }
        }
        if (retry) {
          this.backoffCall(this.getContentCb, url, cb)
        } else {
          this.getContentCb(url, cb)
        }
      })
    } catch (err) {
      const httpStatus = err.response && err.response.status
      logger.warn(`Failed to get [${url}] [status=${httpStatus}]`)
      throw err
    } finally {
      this.releaseRequest()
    }
  }

  public async canGetUrl(url: string): Promise<boolean> {
    try {
      await axios.get(url)
      return true
    } catch (err) {
      return false
    }
  }

  private static handleMWWarningsAndErrors(resp: MwApiResponse): void {
    if (resp.warnings) logger.warn(`Got warning from MW Query ${JSON.stringify(resp.warnings, null, '\t')}`)
    if (resp.error?.code === DB_ERROR) throw new Error(`Got error from MW Query ${JSON.stringify(resp.error, null, '\t')}`)
    if (resp.error) logger.log(`Got error from MW Query ${JSON.stringify(resp.warnings, null, '\t')}`)
  }

  private async getArticleQueryOpts(includePageimages = false, redirects = false): Promise<QueryOpts> {
    const validNamespaceIds = MediaWiki.namespacesToMirror.map((ns) => MediaWiki.namespaces[ns].num)
    const prop = `${includePageimages ? '|pageimages' : ''}${(await MediaWiki.hasCoordinates(this)) ? '|coordinates' : ''}${MediaWiki.getCategories ? '|categories' : ''}`
    return {
      ...MediaWiki.queryOpts,
      prop: MediaWiki.queryOpts.prop.concat(prop),
      rdnamespace: validNamespaceIds.join('|'),
      formatversion: '2',
      redirects: redirects ? true : undefined,
    }
  }

  private async setArticleSubCategories(articleDetails: QueryMwRet) {
    logger.info('Getting subCategories')
    for (const [articleId, articleDetail] of Object.entries(articleDetails)) {
      const isCategoryArticle = articleDetail.ns === 14
      if (isCategoryArticle) {
        const categoryMembers = await this.getSubCategories(articleId)
        ;(articleDetails[articleId] as any).subCategories = categoryMembers.slice()
      }
    }
    return articleDetails
  }

  private async claimRequest(): Promise<null> {
    if (this.activeRequests < this.maxActiveRequests) {
      this.activeRequests += 1
      return null
    } else {
      await new Promise((resolve) => {
        setTimeout(resolve, 200)
      })
      return this.claimRequest()
    }
  }

  private async releaseRequest(): Promise<null> {
    this.activeRequests -= 1
    return null
  }

  private getJSONCb = <T>(url: string, handler: (...args: any[]) => any): void => {
    logger.info(`Getting JSON from [${url}]`)
    axios
      .get<T>(url, this.jsonRequestOptions)
      .then((a) => handler(null, a.data), handler)
      .catch((err) => {
        try {
          if (err.response && err.response.status === 429) {
            logger.log('Received a [status=429], slowing down')
            const newMaxActiveRequests: number = Math.max(this.maxActiveRequests - 1, 1)
            logger.log(`Setting maxActiveRequests from [${this.maxActiveRequests}] to [${newMaxActiveRequests}]`)
            this.maxActiveRequests = newMaxActiveRequests
            return this.getJSONCb(url, handler)
          } else if (err.response && err.response.status === 404) {
            handler(err)
          }
        } catch (a) {
          logger.log('ERR', err)
          handler(err)
        }
      })
  }

  private async getCompressedBody(resp: any): Promise<any> {
    if (isBitmapImageMimeType(resp.headers['content-type'])) {
      if (isWebpCandidateImageMimeType(this.webp, resp.headers['content-type']) && !this.cssDependenceUrls.hasOwnProperty(resp.config.url)) {
        resp.data = await (imagemin as any)
          .buffer(resp.data, imageminOptions.get('webp').get(resp.headers['content-type']))
          .catch(async (err) => {
            if (/Unsupported color conversion request/.test(err.stderr)) {
              return (imagemin as any)
                .buffer(await sharp(resp.data).toColorspace('srgb').toBuffer(), imageminOptions.get('webp').get(resp.headers['content-type']))
                .catch(() => {
                  return resp.data
                })
                .then((data) => {
                  resp.headers['content-type'] = 'image/webp'
                  return data
                })
            } else {
              return (imagemin as any).buffer(resp.data, imageminOptions.get('default').get(resp.headers['content-type'])).catch(() => {
                return resp.data
              })
            }
          })
          .then((data) => {
            resp.headers['content-type'] = 'image/webp'
            return data
          })
        resp.headers.path_postfix = '.webp'
      } else {
        resp.data = await (imagemin as any).buffer(resp.data, imageminOptions.get('default').get(resp.headers['content-type'])).catch(() => {
          return resp.data
        })
      }
      return true
    }
    return false
  }

  private getContentCb = async (url: string, handler: any): Promise<void> => {
    logger.info(`Downloading [${url}]`)
    try {
      if (this.optimisationCacheUrl && isImageUrl(url)) {
        this.downloadImage(url, handler)
      } else {
        const resp = await axios(url, this.arrayBufferRequestOptions)
        await this.getCompressedBody(resp)
        handler(null, {
          responseHeaders: resp.headers,
          content: resp.data,
        })
      }
    } catch (err) {
      try {
        this.errHandler(err, url, handler)
      } catch (a) {
        handler(err)
      }
    }
  }

  private async downloadImage(url: string, handler: any) {
    try {
      this.s3
        .downloadBlob(stripHttpFromUrl(url), this.webp ? 'webp' : '1')
        .then(async (s3Resp) => {
          if (s3Resp?.Metadata?.etag) {
            this.arrayBufferRequestOptions.headers['If-None-Match'] = this.removeEtagWeakPrefix(s3Resp.Metadata.etag)
          }
          const mwResp = await axios(url, this.arrayBufferRequestOptions)

          /* TODO: Code to remove in a few months (February 2023). For
          some reason, it seems a few pictures have 'image/webp'
          mime-type in S3 although they are png, ... This leads to
          having the following code not assuming they should be
          converted to wepb. To avoid this, as a temporary solution,
          such scneario are ignored and mime-type definition relies
          only on url and Mediawiki header. */
          if (s3Resp?.Metadata?.contenttype === 'image/webp') {
            s3Resp.Metadata.contenttype = undefined
          }

          // sanitize Content-Type
          mwResp.headers['content-type'] = getMimeType(url, s3Resp?.Metadata?.contenttype || mwResp.headers['content-type'])

          // Most of the images after uploading once will always have
          // 304 status, until modified.
          // 304 does not have to answer with content-type, we have to get it
          // via S3 metadata or extension
          if (mwResp.status === 304) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const headers = (({ Body, ...o }) => o)(s3Resp)

            if (isWebpCandidateImageMimeType(this.webp, mwResp.headers['content-type']) && !this.cssDependenceUrls.hasOwnProperty(mwResp.config.url)) {
              headers.path_postfix = '.webp'
              headers['content-type'] = 'image/webp'
            }
            handler(null, {
              responseHeaders: headers,
              content: (await this.streamToBuffer(s3Resp.Body as Readable)) as any,
            })
            return
          }

          // Compress content
          await this.getCompressedBody(mwResp)

          // Check for the etag and upload
          const etag = this.removeEtagWeakPrefix(mwResp.headers.etag)
          if (etag) {
            this.s3.uploadBlob(stripHttpFromUrl(url), mwResp.data, etag, mwResp.headers['content-type'], this.webp ? 'webp' : '1')
          }

          handler(null, {
            responseHeaders: mwResp.headers,
            content: mwResp.data,
          })
        })
        .catch((err) => {
          this.errHandler(err, url, handler)
        })
    } catch (err) {
      this.errHandler(err, url, handler)
    }
  }

  private errHandler(err: any, url: string, handler: any): void {
    if (err.response && err.response.status === 429) {
      logger.log('Received a [status=429], slowing down')
      const newMaxActiveRequests: number = Math.max(this.maxActiveRequests - 1, 1)
      logger.log(`Setting maxActiveRequests from [${this.maxActiveRequests}] to [${newMaxActiveRequests}]`)
      this.maxActiveRequests = newMaxActiveRequests
    }
    logger.log(`Not able to download content for ${url} due to ${err}`)
    handler(err)
  }

  private async getSubCategories(articleId: string, continueStr = ''): Promise<Array<{ pageid: number; ns: number; title: string }>> {
    const apiUrlDirector = new ApiURLDirector(MediaWiki.apiUrl.href)

    const { query, continue: cont } = await this.getJSON<any>(apiUrlDirector.buildSubCategoriesURL(articleId, continueStr))
    const items = query.categorymembers.filter((a: any) => a && a.title)

    if (cont && cont.cmcontinue) {
      const nextItems = await this.getSubCategories(articleId, cont.cmcontinue)
      return items.concat(nextItems)
    } else {
      return items
    }
  }

  private backoffCall(handler: (...args: any[]) => void, url: string, callback: (...args: any[]) => void | Promise<void>): void {
    const call = backoff.call(handler, url, callback)
    call.setStrategy(this.backoffOptions.strategy)
    call.retryIf(this.backoffOptions.retryIf)
    call.failAfter(this.backoffOptions.failAfter)
    call.on('backoff', this.backoffOptions.backoffHandler)
    call.start()
  }

  public async getModuleDependencies(title: string) {
    const genericJsModules = config.output.mw.js
    const genericCssModules = config.output.mw.css
    /* These vars will store the list of js and css dependencies for
      the article we are downloading. */
    let jsConfigVars = ''
    let jsDependenciesList: string[] = []
    let styleDependenciesList: string[] = []

    const apiUrlDirector = new ApiURLDirector(MediaWiki.apiUrl.href)

    const articleApiUrl = apiUrlDirector.buildArticleApiURL(title)

    const articleData = await this.getJSON<any>(articleApiUrl)

    if (articleData.error) {
      const errorMessage = `Unable to retrieve js/css dependencies for article '${this}': ${articleData.error.code}`
      logger.error(errorMessage)

      /* If article is missing (for example because it just has been deleted) */
      if (articleData.error.code === 'missingtitle') {
        return { jsConfigVars, jsDependenciesList, styleDependenciesList }
      }

      /* Something went wrong in modules retrieval at app level (no HTTP error) */
      throw new Error(errorMessage)
    }

    const {
      parse: { modules, modulescripts, modulestyles, headhtml },
    } = articleData
    jsDependenciesList = genericJsModules.concat(modules, modulescripts).filter((a) => a)
    styleDependenciesList = [].concat(modules, modulestyles, genericCssModules).filter((a) => a)
    styleDependenciesList = styleDependenciesList.filter((oneStyleDep) => !contains(config.filters.blackListCssModules, oneStyleDep))

    logger.info(`Js dependencies of ${title} : ${jsDependenciesList}`)
    logger.info(`Css dependencies of ${title} : ${styleDependenciesList}`)

    // Saving, as a js module, the jsconfigvars that are set in the header of a wikipedia page
    // the script below extracts the config with a regex executed on the page header returned from the api
    const scriptTags = domino.createDocument(`${headhtml}</body></html>`).getElementsByTagName('script')
    const regex = /mw\.config\.set\(\{.*?\}\);/gm
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < scriptTags.length; i += 1) {
      if (scriptTags[i].text.includes('mw.config.set')) {
        jsConfigVars = regex.exec(scriptTags[i].text)[0] || ''
        jsConfigVars = `(window.RLQ=window.RLQ||[]).push(function() {${jsConfigVars}});`
      } else if (scriptTags[i].text.includes('RLCONF') || scriptTags[i].text.includes('RLSTATE') || scriptTags[i].text.includes('RLPAGEMODULES')) {
        jsConfigVars = scriptTags[i].text
      }
    }

    jsConfigVars = jsConfigVars.replace('nosuchaction', 'view') // to replace the wgAction config that is set to 'nosuchaction' from api but should be 'view'

    return { jsConfigVars, jsDependenciesList, styleDependenciesList }
  }

  // Solution to handle aws js sdk v3 from https://github.com/aws/aws-sdk-js-v3/issues/1877
  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    return await new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = []
      stream.on('data', (chunk) => chunks.push(chunk))
      stream.on('error', reject)
      stream.on('end', () => resolve(Buffer.concat(chunks)))
    })
  }
}

export default Downloader
