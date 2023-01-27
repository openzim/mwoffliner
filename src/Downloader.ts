import * as path from 'path'
import * as urlParser from 'url'
import deepmerge from 'deepmerge'
import * as backoff from 'backoff'
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

import {
  normalizeMwResponse,
  objToQueryString,
  DB_ERROR,
  WEAK_ETAG_REGEX,
  renderArticle,
  stripHttpFromUrl,
  isBitmapImageMimeType,
  isImageUrl,
  getMimeType,
  isWebpCandidateImageMimeType,
} from './util/index.js'
import S3 from './S3.js'
import { Dump } from './Dump.js'
import logger from './Logger.js'
import MediaWiki from './MediaWiki.js'

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
  mw: MediaWiki
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

export interface MWCapabilities {
  apiAvailable: boolean
  veApiAvailable: boolean
  coordinatesAvailable: boolean
  desktopRestApiAvailable: boolean
  mobileRestApiAvailable: boolean
}

class Downloader {
  public readonly mw: MediaWiki
  public loginCookie = ''
  public readonly speed: number
  public baseUrl: string
  public baseUrlForMainPage: string
  public cssDependenceUrls: KVS<boolean> = {}
  public readonly webp: boolean = false

  private readonly uaString: string
  private activeRequests = 0
  private maxActiveRequests = 1
  private readonly requestTimeout: number
  private readonly urlPartCache: KVS<string> = {}
  private readonly backoffOptions: BackoffOptions
  private readonly optimisationCacheUrl: string
  private s3: S3
  private mwCapabilities: MWCapabilities // todo move to MW
  public arrayBufferRequestOptions: AxiosRequestConfig
  public jsonRequestOptions: AxiosRequestConfig
  public streamRequestOptions: AxiosRequestConfig

  constructor({ mw, uaString, speed, reqTimeout, optimisationCacheUrl, s3, webp, backoffOptions }: DownloaderOpts) {
    this.mw = mw
    this.uaString = uaString
    this.speed = speed
    this.maxActiveRequests = speed * 10
    this.requestTimeout = reqTimeout
    this.loginCookie = ''
    this.optimisationCacheUrl = optimisationCacheUrl
    this.webp = webp
    this.s3 = s3
    this.mwCapabilities = {
      apiAvailable: false,
      veApiAvailable: false,
      coordinatesAvailable: true,
      desktopRestApiAvailable: false,
      mobileRestApiAvailable: false,
    }

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
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true }),

      headers: {
        accept: 'application/octet-stream',
        'cache-control': 'public, max-stale=86400',
        'accept-encoding': 'gzip, deflate',
        'user-agent': this.uaString,
        cookie: this.loginCookie,
      },
      responseType: 'stream',
      timeout: this.requestTimeout,
      method: 'GET',
    }
  }

  public serializeUrl(url: string): string {
    const { path } = urlParser.parse(url)
    const cacheablePart = url.replace(path, '')
    const cacheEntry = Object.entries(this.urlPartCache).find(([, value]) => value === cacheablePart)
    let cacheKey
    if (!cacheEntry) {
      const cacheId = String(Object.keys(this.urlPartCache).length + 1)
      this.urlPartCache[cacheId] = cacheablePart
      cacheKey = `_${cacheId}_`
    } else {
      cacheKey = `_${cacheEntry[0]}_`
    }
    return `${cacheKey}${path}`
  }

  public deserializeUrl(url: string): string {
    if (!url.startsWith('_')) return url
    const [, cacheId, ...pathParts] = url.split('_')
    const path = pathParts.join('_')
    const cachedPart = this.urlPartCache[cacheId]
    return `${cachedPart}${path}`
  }

  public async setBaseUrls() {
    this.baseUrl = this.mwCapabilities.mobileRestApiAvailable
      ? this.mw.mobileRestApiUrl.href
      : this.mwCapabilities.desktopRestApiAvailable
      ? this.mw.desktopRestApiUrl.href
      : this.mwCapabilities.veApiAvailable
      ? this.mw.veApiUrl.href
      : undefined

    this.baseUrlForMainPage = this.mwCapabilities.desktopRestApiAvailable ? this.mw.desktopRestApiUrl.href : this.mwCapabilities.veApiAvailable ? this.mw.veApiUrl.href : undefined

    logger.log('Base Url: ', this.baseUrl)
    logger.log('Base Url for Main Page: ', this.baseUrlForMainPage)

    if (!this.baseUrl || !this.baseUrlForMainPage) throw new Error('Unable to find appropriate API end-point to retrieve article HTML')
  }

  public async checkApiAvailabilty(url: string): Promise<boolean> {
    try {
      const resp = await axios.get(url, { headers: { cookie: this.loginCookie } })
      // Check for hostname is for domain name in cases of redirects.
      return resp.status === 200 && !resp.headers['mediawiki-api-error'] && path.dirname(url) === path.dirname(resp.request.res.responseUrl)
    } catch (err) {
      return false
    }
  }

  public async checkCapabilities(testArticleId = 'MediaWiki:Sidebar'): Promise<void> {
    // By default check all API's responses and set the capabilities
    // accordingly. We need to set a default page (always there because
    // installed per default) to request the REST API, otherwise it would
    // fail the check.
    this.mwCapabilities.mobileRestApiAvailable = await this.checkApiAvailabilty(this.mw.getMobileRestApiArticleUrl(testArticleId))
    this.mwCapabilities.desktopRestApiAvailable = await this.checkApiAvailabilty(this.mw.getDesktopRestApiArticleUrl(testArticleId))
    this.mwCapabilities.veApiAvailable = await this.checkApiAvailabilty(this.mw.getVeApiArticleUrl(testArticleId))
    this.mwCapabilities.apiAvailable = await this.checkApiAvailabilty(this.mw.apiUrl.href)

    // Coordinate fetching
    const reqOpts = objToQueryString({
      ...this.getArticleQueryOpts(),
    })
    const resp = await this.getJSON<MwApiResponse>(`${this.mw.apiUrl.href}${reqOpts}`)
    const isCoordinateWarning = resp.warnings && resp.warnings.query && (resp.warnings.query['*'] || '').includes('coordinates')
    if (isCoordinateWarning) {
      logger.info('Coordinates not available on this wiki')
      this.mwCapabilities.coordinatesAvailable = false
    }
  }

  public removeEtagWeakPrefix(etag: string): string {
    return etag && etag.replace(WEAK_ETAG_REGEX, '')
  }

  public query(query: string): KVS<any> {
    return this.getJSON(this.mw.getApiQueryUrl(query))
  }

  public async getArticleDetailsIds(articleIds: string[], shouldGetThumbnail = false): Promise<QueryMwRet> {
    let continuation: ContinueOpts
    let finalProcessedResp: QueryMwRet

    while (true) {
      const queryOpts = {
        ...this.getArticleQueryOpts(shouldGetThumbnail, true),
        titles: articleIds.join('|'),
        ...(this.mwCapabilities.coordinatesAvailable ? { colimit: 'max' } : {}),
        ...(this.mw.getCategories
          ? {
              cllimit: 'max',
              clshow: '!hidden',
            }
          : {}),
        ...(continuation || {}),
      }
      const queryString = objToQueryString(queryOpts)
      const reqUrl = this.mw.getApiQueryUrl(queryString)
      const resp = await this.getJSON<MwApiResponse>(reqUrl)
      Downloader.handleMWWarningsAndErrors(resp)

      let processedResponse = resp.query ? normalizeMwResponse(resp.query) : {}
      if (resp.continue) {
        continuation = resp.continue
        const relevantDetails = this.stripNonContinuedProps(processedResponse)

        finalProcessedResp = finalProcessedResp === undefined ? relevantDetails : deepmerge(finalProcessedResp, relevantDetails)
      } else {
        if (this.mw.getCategories) {
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
        ...this.getArticleQueryOpts(),
        ...(this.mwCapabilities.coordinatesAvailable ? { colimit: 'max' } : {}),
        ...(this.mw.getCategories
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

      const queryString = objToQueryString(queryOpts)
      const reqUrl = this.mw.getApiQueryUrl(queryString)

      const resp = await this.getJSON<MwApiResponse>(reqUrl)
      Downloader.handleMWWarningsAndErrors(resp)

      let processedResponse = normalizeMwResponse(resp.query)

      gCont = resp['query-continue']?.allpages?.gapcontinue ?? gCont

      const queryComplete = Object.keys(resp['query-continue'] || {}).filter((key) => key !== 'allpages').length === 0

      if (!queryComplete) {
        queryContinuation = resp['query-continue']

        const relevantDetails = this.stripNonContinuedProps(processedResponse)

        finalProcessedResp = finalProcessedResp === undefined ? relevantDetails : deepmerge(finalProcessedResp, relevantDetails)
      } else {
        if (this.mw.getCategories) {
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

  public async getArticle(articleId: string, dump: Dump): Promise<RenderedArticle[]> {
    const isMainPage = dump.isMainPage(articleId)
    const articleApiUrl = this.getArticleUrl(articleId, isMainPage)

    logger.info(`Getting article [${articleId}] from ${articleApiUrl}`)

    const json = await this.getJSON<any>(articleApiUrl)
    if (json.error) {
      throw json.error
    }
    return await renderArticle(json, articleId, dump, this.mwCapabilities)
  }

  public async getJSON<T>(_url: string): Promise<T> {
    const url = this.deserializeUrl(_url)
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

  public async downloadContent(_url: string): Promise<{ content: Buffer | string; responseHeaders: any }> {
    if (!_url) {
      throw new Error(`Parameter [${_url}] is not a valid url`)
    }
    const url = this.deserializeUrl(_url)

    await this.claimRequest()
    return new Promise((resolve, reject) => {
      this.backoffCall(this.getContentCb, url, async (err: any, val: any) => {
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

  public async canGetUrl(url: string): Promise<boolean> {
    try {
      await axios.get(url)
      return true
    } catch (err) {
      return false
    }
  }

  private getArticleUrl(articleId: string, isMainPage: boolean): string {
    return `${isMainPage ? this.baseUrlForMainPage : this.baseUrl}${encodeURIComponent(articleId)}`
  }

  private stripNonContinuedProps(articleDetails: QueryMwRet, cont: QueryContinueOpts | ContinueOpts = {}): QueryMwRet {
    const propsMap: KVS<string[]> = {
      pageimages: ['thumbnail', 'pageimage'],
      coordinates: ['coordinates'],
      categories: ['categories'],
    }
    const keysToKeep: string[] = ['subCategories', 'revisions', 'redirects'].concat(Object.keys(cont).reduce((acc, key) => acc.concat(propsMap[key] || []), []))
    const items = Object.entries(articleDetails).map(([aId, detail]) => {
      const newDetail = keysToKeep.reduce((acc, key) => {
        const val = (detail as any)[key]
        if (!val) {
          return acc
        } else {
          return {
            ...acc,
            [key]: val,
          }
        }
      }, {})
      return [aId, newDetail]
    })
    return items.reduce((acc, [key, detail]: any[]) => {
      return { ...acc, [key]: detail }
    }, {})
  }

  private static handleMWWarningsAndErrors(resp: MwApiResponse): void {
    if (resp.warnings) logger.warn(`Got warning from MW Query ${JSON.stringify(resp.warnings, null, '\t')}`)
    if (resp.error?.code === DB_ERROR) throw new Error(`Got error from MW Query ${JSON.stringify(resp.error, null, '\t')}`)
    if (resp.error) logger.log(`Got error from MW Query ${JSON.stringify(resp.warnings, null, '\t')}`)
  }

  private getArticleQueryOpts(includePageimages = false, redirects = false) {
    const validNamespaceIds = this.mw.namespacesToMirror.map((ns) => this.mw.namespaces[ns].num)
    return {
      action: 'query',
      format: 'json',
      prop: `redirects|revisions${includePageimages ? '|pageimages' : ''}${this.mwCapabilities.coordinatesAvailable ? '|coordinates' : ''}${
        this.mw.getCategories ? '|categories' : ''
      }`,
      rdlimit: 'max',
      rdnamespace: validNamespaceIds.join('|'),
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
    logger.log('getCompressedBody', resp.headers['content-type'])
    if (isBitmapImageMimeType(resp.headers['content-type'])) {
      if (isWebpCandidateImageMimeType(this.webp, resp.headers['content-type']) && !this.cssDependenceUrls.hasOwnProperty(resp.config.url)) {
        logger.log('COMPRESS IT')
        resp.data = await (imagemin as any)
          .buffer(resp.data, imageminOptions.get('webp').get(resp.headers['content-type']))
          .catch(async (err) => {
            if (/Unsupported color conversion request/.test(err.stderr)) {
              return await (imagemin as any)
                .buffer(await sharp(resp.data).toColorspace('srgb').toBuffer(), imageminOptions.get('webp').get(resp.headers['content-type']))
                .catch(() => {
                  return resp.data
                })
                .then((data) => {
                  resp.headers['content-type'] = 'image/webp'
                  return data
                })
            } else {
              return await (imagemin as any).buffer(resp.data, imageminOptions.get('default').get(resp.headers['content-type'])).catch(() => {
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
        logger.log('DONT COMPRESS')
        resp.data = await (imagemin as any).buffer(resp.data, imageminOptions.get('default').get(resp.headers['content-type'])).catch(() => {
          return resp.data
        })
      }
      return true
    }
    logger.log('NOT AN IMAGE')
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
              content: s3Resp.Body,
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
    const { query, continue: cont } = await this.getJSON<any>(this.mw.subCategoriesApiUrl(articleId, continueStr))
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
}

export default Downloader
