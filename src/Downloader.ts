import * as backoff from 'backoff'
import { config } from './config.js'
import { contains, normalizeMwResponse, DB_ERROR, WEAK_ETAG_REGEX, stripHttpFromUrl, isBitmapImageMimeType, isWebpCandidateImageMimeType } from './util/index.js'
import { Readable } from 'stream'
import deepmerge from 'deepmerge'
import * as domino from 'domino'
import { default as imagemin } from 'imagemin'
import imageminAdvPng from 'imagemin-advpng'
import type { BackoffStrategy } from 'backoff'
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import { default as imageminPngquant } from 'imagemin-pngquant'
import imageminGifsicle from 'imagemin-gifsicle'
import imageminJpegoptim from 'imagemin-jpegoptim'
import imageminWebp from 'imagemin-webp'
import sharp from 'sharp'
import { fileTypeFromBuffer } from 'file-type'
import { HttpCookieAgent, HttpsCookieAgent } from 'http-cookie-agent/http'
import { CookieJar } from 'tough-cookie'

import S3 from './S3.js'
import * as logger from './Logger.js'
import MediaWiki, { QueryOpts, SiteInfoResponse } from './MediaWiki.js'
import { Dump } from './Dump.js'
import ApiURLDirector from './util/builders/url/api.director.js'
import urlHelper from './util/url.helper.js'

import WikimediaDesktopURLDirector from './util/builders/url/desktop.director.js'
import WikimediaMobileURLDirector from './util/builders/url/mobile.director.js'
import VisualEditorURLDirector from './util/builders/url/visual-editor.director.js'
import RestApiURLDirector from './util/builders/url/rest-api.director.js'
import { Renderer } from './renderers/abstract.renderer.js'
import { findFirstMatchingRule, renderDownloadError } from './error.manager.js'
import RedisStore from './RedisStore.js'

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
  trustedJs?: string[]
  backoffOptions?: BackoffOptions
  insecure?: boolean
}

interface BackoffOptions {
  strategy: BackoffStrategy
  failAfter: number
  retryIf: (error?: any) => boolean
  backoffHandler: (number: number, delay: number, error?: any) => void
}

interface CompressionData {
  data: any
}

export class DownloadError extends Error {
  urlCalled: string | null
  httpReturnCode: number | null
  responseContentType: string | null
  responseData: any

  constructor(message: string, urlCalled: string | null, httpReturnCode: number | null, responseContentType: string | null, responseData: any) {
    super(message)
    this.name = 'DownloadError'
    this.urlCalled = urlCalled
    this.httpReturnCode = httpReturnCode
    this.responseContentType = responseContentType
    this.responseData = responseData

    if ('captureStackTrace' in Error) {
      // Avoid DownloadError itself in the stack trace
      Error.captureStackTrace(this, DownloadError)
    }
  }
}

export interface DownloadErrorContext {
  urlCalled: string
  errorCode: string | null
  httpReturnCode: number | null
  responseContentType: string | null
  responseData: any
}

type URLDirector = WikimediaDesktopURLDirector | WikimediaMobileURLDirector | VisualEditorURLDirector | RestApiURLDirector
/**
 * Downloader is a class providing content retrieval functionalities for both Mediawiki and S3 remote instances.
 */
class Downloader {
  private static instance: Downloader
  public static getInstance() {
    if (!Downloader.instance) {
      Downloader.instance = new Downloader()
    }
    return Downloader.instance
  }
  private _speed: number
  public cssDependenceUrls: KVS<boolean> = {}
  private _webp: boolean = false
  private _requestTimeout: number
  private _basicRequestOptions: AxiosRequestConfig
  private _arrayBufferRequestOptions: AxiosRequestConfig
  private _jsonRequestOptions: AxiosRequestConfig
  private _streamRequestOptions: AxiosRequestConfig
  public trustedJs: string[] = []
  public wikimediaMobileJsDependenciesList: string[] = []
  public wikimediaMobileStyleDependenciesList: string[] = []

  private uaString: string
  private activeRequests = 0
  private maxActiveRequests = 1
  private backoffOptions: BackoffOptions
  private optimisationCacheUrl: string
  private s3: S3
  private _apiUrlDirector: ApiURLDirector
  private cookierJar: CookieJar

  private articleUrlDirector: URLDirector
  private mainPageUrlDirector: URLDirector
  private insecure: boolean = false

  get speed() {
    return this._speed
  }

  get webp() {
    return this._webp
  }
  get requestTimeout() {
    return this._requestTimeout
  }
  get basicRequestOptions() {
    return this._basicRequestOptions
  }
  get arrayBufferRequestOptions() {
    return this._arrayBufferRequestOptions
  }
  get jsonRequestOptions() {
    return this._jsonRequestOptions
  }
  get streamRequestOptions() {
    return this._streamRequestOptions
  }
  get apiUrlDirector() {
    return this._apiUrlDirector
  }

  set init({ uaString, speed, reqTimeout, optimisationCacheUrl, s3, webp, trustedJs = config.output.mw.js_trusted.slice(), backoffOptions, insecure }: DownloaderOpts) {
    this.reset()
    this.uaString = uaString
    this._speed = speed
    this.maxActiveRequests = speed * 10
    this._requestTimeout = reqTimeout
    this.optimisationCacheUrl = optimisationCacheUrl
    this._webp = webp
    this.trustedJs = trustedJs
    this.s3 = s3
    this._apiUrlDirector = new ApiURLDirector(MediaWiki.actionApiUrl.href)
    this.insecure = insecure
    this.cookierJar = new CookieJar()

    this.backoffOptions = {
      // retry up to 10 times, with a minimum of 1sec, maximum of 1min
      // this means we retry for up to about 6 mins, which is supposed
      // to be sufficient for backend to recover from transient errors
      strategy: new backoff.ExponentialStrategy({ initialDelay: 1000, maxDelay: 60000 }),
      failAfter: 10,
      retryIf: (err: any) => {
        const requestedUrl = err.urlCalled || err.config?.url || 'unknown'
        if (err instanceof AxiosError && err.code && !['ERR_BAD_REQUEST', 'ERR_BAD_RESPONSE', 'ERR_CANCELED'].includes(err.code)) {
          logger.log(`Retrying ${requestedUrl} URL due to ${err.code} error`)
          return true // retry all connection issues
        }
        const httpReturnCode = err.response?.status || err.httpReturnCode
        if ([429, 500, 502, 503, 504].includes(httpReturnCode)) {
          logger.log(`Retrying ${requestedUrl} URL due to HTTP ${httpReturnCode} error`)
          return true // retry these HTTP status codes
        }
        if (
          [
            'internal_api_error_ArgumentCountError',
            'internal_api_error_DBConnectionError',
            'internal_api_error_DBUnexpectedError',
            'internal_api_error_Wikibase\\DataModel\\Services\\Lookup\\EntityLookupException',
            'internal_api_error_Shellbox\\ShellboxError',
            'internal_api_error_Wikimedia\\FileBackend\\FileBackendError',
          ].includes(err.responseData?.error?.code)
        ) {
          logger.log(`Retrying ${requestedUrl} URL due to ${err.responseData?.error?.code} Mediawiki error`)
          return true // retry these Mediawiki codes which are known to be transient
        }
        return false // don't retry other errors
      },
      backoffHandler: (number: number, delay: number) => {
        logger.info(`[backoff] #${number} after ${delay} ms`)
      },
      ...backoffOptions,
    }

    this._basicRequestOptions = {
      // HTTP agent pools with 'keepAlive' to reuse TCP connections, so it's faster
      // Set cookie jar and use special Http(s)CookieAgent so that cookies are automatically intercepted and persited across calls
      httpAgent: new HttpCookieAgent({ cookies: { jar: this.cookierJar }, keepAlive: true }),
      httpsAgent: new HttpsCookieAgent({ cookies: { jar: this.cookierJar }, keepAlive: true, rejectUnauthorized: !this.insecure }), // rejectUnauthorized: false disables TLS
      timeout: this.requestTimeout,
      headers: {
        // Use the base domain of the wiki being scraped as the Referer header, so that we can
        // successfully scrap WMF map tiles.
        Referer: MediaWiki.baseUrl.href,
        'cache-control': 'public, max-stale=86400',
        'user-agent': this.uaString,
      },
      validateStatus(status) {
        return (status >= 200 && status < 300) || status === 304
      },
    }

    this._arrayBufferRequestOptions = {
      ...this.basicRequestOptions,
      responseType: 'arraybuffer',
      method: 'GET',
    }

    this._jsonRequestOptions = {
      ...this.basicRequestOptions,
      headers: {
        ...this.basicRequestOptions.headers,
        accept: 'application/json',
        'accept-encoding': 'gzip, deflate',
      },
      responseType: 'json',
      method: 'GET',
    }

    this._streamRequestOptions = {
      ...this.basicRequestOptions,
      headers: {
        ...this.basicRequestOptions.headers,
        accept: 'application/octet-stream',
        'accept-encoding': 'gzip, deflate',
      },
      responseType: 'stream',
      method: 'GET',
    }
  }

  private reset() {
    this.uaString = undefined
    this._speed = undefined
    this.maxActiveRequests = undefined
    this._requestTimeout = undefined
    this.optimisationCacheUrl = undefined
    this._webp = false
    this.trustedJs = []
    this.s3 = undefined
    this._apiUrlDirector = undefined
    this.insecure = false

    this.backoffOptions = undefined
    this._basicRequestOptions = undefined
    this._arrayBufferRequestOptions = undefined
    this._jsonRequestOptions = undefined
    this._streamRequestOptions = undefined

    this.cssDependenceUrls = {}

    this.wikimediaMobileJsDependenciesList = []
    this.wikimediaMobileStyleDependenciesList = []

    this.activeRequests = 0
    this.maxActiveRequests = 1

    this.articleUrlDirector = undefined
    this.mainPageUrlDirector = undefined
  }

  private getUrlDirector(renderer: object) {
    switch (renderer.constructor.name) {
      case 'WikimediaDesktopRenderer':
        return MediaWiki.wikimediaDesktopUrlDirector
      case 'VisualEditorRenderer':
        return MediaWiki.visualEditorUrlDirector
      case 'WikimediaMobileRenderer':
        return MediaWiki.wikimediaMobileUrlDirector
      case 'RestApiRenderer':
        return MediaWiki.restApiUrlDirector
      case 'ActionParseRenderer':
        return MediaWiki.actionParseUrlDirector
      /* istanbul ignore next */
      default:
        throw new Error(`Unknown renderer ${renderer.constructor.name}`)
    }
  }

  public setUrlsDirectors(mainPageRenderer: Renderer, articlesRenderer: Renderer): void {
    this.articleUrlDirector = this.getUrlDirector(articlesRenderer)
    this.mainPageUrlDirector = this.getUrlDirector(mainPageRenderer)
  }

  public getArticleUrl(articleId: string, articleUrlOpts: RendererArticleOpts = {}): string {
    return this.articleUrlDirector.buildArticleURL(articleId, articleUrlOpts)
  }

  public getMainPageUrl(articleId: string): string {
    return this.mainPageUrlDirector.buildArticleURL(articleId)
  }

  public removeEtagWeakPrefix(etag: string): string {
    return etag && etag.replace(WEAK_ETAG_REGEX, '')
  }

  public querySiteInfo(): Promise<SiteInfoResponse> {
    return this.getJSON<SiteInfoResponse>(this.apiUrlDirector.buildSiteInfoURL())
  }

  public async getArticleDetailsIds(articleIds: string[], shouldGetThumbnail = false): Promise<QueryMwRet> {
    let continuation: ContinueOpts
    let finalProcessedResp: QueryMwRet

    while (true) {
      const queryOpts: KVS<any> = {
        ...(await this.getArticleQueryOpts(shouldGetThumbnail, true)),
        titles: articleIds.join('|'),
        ...((await MediaWiki.hasCoordinates()) ? { colimit: 'max' } : {}),
        ...(MediaWiki.getCategories
          ? {
              cllimit: 'max',
              clshow: '!hidden',
            }
          : {}),
        ...continuation,
      }

      const reqUrl = this.apiUrlDirector.buildQueryURL(queryOpts)

      const resp = await this.getJSON<MwApiResponse>(reqUrl)

      Downloader.handleMWWarningsAndErrors(resp)

      let processedResponse = resp.query?.pages ? normalizeMwResponse(resp.query) : {}
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
        ...((await MediaWiki.hasCoordinates()) ? { colimit: 'max' } : {}),
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

  public async getLogEvents(letype: string, articleId: string): Promise<any> {
    const logEventsData = await this.getJSON<any>(this.apiUrlDirector.buildLogEventsQuery(letype, articleId))
    return logEventsData.query?.logevents
  }

  public async getArticle(
    articleId: string,
    articleDetailXId: RKVS<ArticleDetail>,
    articleRenderer: Renderer,
    articleUrl,
    dump: Dump,
    articleDetail?: ArticleDetail,
  ): Promise<any> {
    logger.info(`Getting article [${articleId}] from ${articleUrl}`)

    try {
      const { data, moduleDependencies, redirects, displayTitle, articleSubtitle, bodyCssClass, htmlCssClass } = await articleRenderer.download({
        articleId,
        articleUrl,
        articleDetail,
      })

      // Cope with the fact that the page we are fetching might have been moved and replaced by a redirect
      // In such a case, the download above is expected to follow the redirect so that we have proper original
      // content at original article path, but we probably need to add a redirect since new article location
      // probably did not existed when listing articles (might have existed if the move occured during article
      // listing). The redirect we add in hence in the "opposite" direction than usual, i.e. it will redirect
      // from new location to original location. Note that only ActionParse API gives proper redirects info.
      for (const redirect of redirects) {
        if (!(await RedisStore.articleDetailXId.exists(redirect.to)) && !(await RedisStore.redirectsXId.exists(redirect.to))) {
          RedisStore.redirectsXId.set(redirect.to, { targetId: redirect.from, title: redirect.to, fragment: '' })
        }
      }

      return await articleRenderer.render({
        data,
        moduleDependencies,
        articleId,
        articleDetailXId,
        articleDetail,
        displayTitle,
        articleSubtitle,
        bodyCssClass,
        htmlCssClass,
        dump,
      })
    } catch (err) {
      let downloadErrorContext: DownloadErrorContext
      if (err instanceof AxiosError) {
        downloadErrorContext = {
          errorCode: err.code,
          urlCalled: err.config.url,
          httpReturnCode: err.status,
          responseContentType: err.response ? err.response.headers['content-type'].toString() : null,
          responseData: err.response?.data,
        }
      } else if (err instanceof DownloadError) {
        downloadErrorContext = {
          errorCode: null,
          urlCalled: err.urlCalled,
          httpReturnCode: err.httpReturnCode,
          responseContentType: err.responseContentType,
          responseData: err.responseData,
        }
      }
      if (!downloadErrorContext) {
        throw err
      }
      logger.warn(
        `Article ${articleId} failed to download from '${downloadErrorContext.urlCalled}' with ` +
          `'${downloadErrorContext.errorCode}' error code, ` +
          `'${downloadErrorContext.httpReturnCode}' HTTP return code ` +
          `and '${downloadErrorContext.responseContentType}' content-type ` +
          `returned instead:\n${JSON.stringify(downloadErrorContext.responseData)}`,
      )
      const errorRule = findFirstMatchingRule(downloadErrorContext)
      if (errorRule === null) {
        logger.error('This is a fatal download error, aborting')
        throw err
      }
      if (errorRule.isHardFailure) {
        logger.log(`This is a hard ${errorRule.detailsMessageKey} error which will be replaced by a placeholder`)
        dump.status.articles.hardFail += 1
        dump.status.articles.hardFailedArticleIds.push(articleId)
        if (dump.maxHardFailedArticles > 0 && dump.status.articles.hardFail > dump.maxHardFailedArticles) {
          throw new Error('Too many articles failed to download')
        }
      } else {
        logger.log(`This is a soft ${errorRule.detailsMessageKey} error which will be replaced by a placeholder`)
        dump.status.articles.softFail += 1
        dump.status.articles.softFailedArticleIds.push(articleId)
      }
      RedisStore.articleDetailXId.delete(articleId) // Remove article from list so that we stop creating links to this placeholder
      const articleTitle = articleId.replace(/_/g, ' ')
      const errorPlaceholderHtml = renderDownloadError(errorRule, dump, articleId, articleTitle)
      return [
        {
          articleId,
          displayTitle: articleTitle,
          html: errorPlaceholderHtml,
          imageDependencies: [],
          videoDependencies: [],
          mediaDependencies: [],
          moduleDependencies: [],
          staticFiles: config.output.downloadErrorResources,
          subtitles: [],
        },
      ]
    }
  }

  public async getJSON<T>(_url: string): Promise<T> {
    const url = urlHelper.deserializeUrl(_url)
    await this.claimRequest()
    return new Promise<T>((resolve, reject) => {
      this.backoffCall(this.getJSONCb, url, 'json', (err: any, val: any) => {
        this.releaseRequest()
        if (err) {
          const httpStatus = (err.response && err.response.status) || err.httpReturnCode
          logger.info(`Failed to get [${url}] [status=${httpStatus}]`)
          reject(err)
        } else {
          resolve(val)
        }
      })
    })
  }

  public async request<T = any, R extends AxiosResponse<T> = AxiosResponse<T>, D = any>(config: AxiosRequestConfig<D>): Promise<R> {
    return axios.request<T, R, D>({
      ...this._basicRequestOptions,
      ...config,
      headers: {
        ...this._basicRequestOptions.headers,
        ...config?.headers,
      },
      signal: AbortSignal.timeout(this.requestTimeout),
    })
  }

  public async get<T = any, R extends AxiosResponse<T> = AxiosResponse<T>, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<R> {
    return this.request({ url, method: 'GET', ...config })
  }

  public async post<T = any, R extends AxiosResponse<T> = AxiosResponse<T>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R> {
    return this.request({ url, data, method: 'POST', ...config })
  }

  public async downloadContent(_url: string, kind: DonwloadKind, retry = true): Promise<{ content: Buffer | string; contentType: string; setCookie: string | null }> {
    if (!_url) {
      throw new Error(`Parameter [${_url}] is not a valid url`)
    }

    let url = urlHelper.deserializeUrl(_url)
    if (url.startsWith('//')) {
      url = `${MediaWiki.baseUrl.protocol}${url}`
    }

    await this.claimRequest()

    try {
      return new Promise((resolve, reject) => {
        const cb = (err: any, val: any) => {
          if (err) {
            reject(err)
          } else {
            resolve(val)
          }
        }
        if (retry) {
          this.backoffCall(this.getContentCb, url, kind, cb)
        } else {
          this.getContentCb(url, kind, cb)
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
      await this.request({ url, method: 'GET', ...this.arrayBufferRequestOptions })
      return true
    } catch {
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
    const prop = `${includePageimages ? '|pageimages' : ''}${(await MediaWiki.hasCoordinates()) ? '|coordinates' : ''}${MediaWiki.getCategories ? '|categories' : ''}`
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

  private getJSONCb = <T>(url: string, kind: DonwloadKind, handler: (...args: any[]) => any): void => {
    logger.info(`Getting JSON from [${url}]`)
    this.request<T>({ url, method: 'GET', ...this.jsonRequestOptions })
      .then((val) => {
        if ((val.data as any).error) {
          handler(new DownloadError(`Error returned while calling API`, url, val.status, val.headers['content-type'].toString(), val.data))
        } else {
          handler(null, val.data)
        }
      })
      .catch((err) => handler(err))
  }

  private async getImageMimeType(data: any): Promise<string | null> {
    const fileType = await fileTypeFromBuffer(data)
    if (fileType && fileType.mime === 'application/xml') {
      // File type is known to be wrong, might be SVG
      return null
    }
    return fileType ? fileType.mime : null
  }

  private async getCompressedBody(input: CompressionData): Promise<CompressionData> {
    const contentType = await this.getImageMimeType(input.data)
    if (isBitmapImageMimeType(contentType)) {
      if (this.webp && isWebpCandidateImageMimeType(contentType)) {
        return {
          data: await (imagemin as any)
            .buffer(input.data, imageminOptions.get('webp').get(contentType))
            .catch(async (err) => {
              if (/Unsupported color conversion request/.test(err.stderr)) {
                return (imagemin as any)
                  .buffer(await sharp(input.data).toColorspace('srgb').toBuffer(), imageminOptions.get('webp').get(contentType))
                  .catch(() => {
                    return input.data
                  })
                  .then((data) => {
                    return data
                  })
              } else {
                return (imagemin as any).buffer(input.data, imageminOptions.get('default').get(contentType)).catch(() => {
                  return input.data
                })
              }
            })
            .then((data) => {
              return data
            }),
        }
      } else {
        return {
          data: await (imagemin as any).buffer(input.data, imageminOptions.get('default').get(contentType)).catch(() => {
            return input.data
          }),
        }
      }
    }
    return {
      data: input.data,
    }
  }

  private getContentCb = async (url: string, kind: DonwloadKind, handler: any): Promise<void> => {
    logger.info(`Downloading [${url}]`)
    try {
      if (this.optimisationCacheUrl && kind === 'image') {
        this.downloadImage(url, handler)
      } else {
        const resp = await this.request({ url, method: 'GET', ...this.arrayBufferRequestOptions })
        // If content is an image, we might benefit from compressing it
        const content = kind === 'image' ? (await this.getCompressedBody({ data: resp.data })).data : resp.data
        // compute content-type from content, since getCompressedBody might have modified it
        const contentType = kind === 'image' ? (await this.getImageMimeType(content)) || resp.headers['content-type'] : resp.headers['content-type']
        handler(null, {
          contentType,
          content,
        })
      }
    } catch (err) {
      try {
        this.errHandler(err, url, handler)
      } catch {
        handler(err)
      }
    }
  }

  private async downloadImage(url: string, handler: any) {
    try {
      this.s3

        // Check first if we have an entry in the (object storage) cache for this URL
        .downloadBlob(stripHttpFromUrl(url), this.webp ? 'webp' : '1')

        // Handle the cache response and act accordingly
        .then(async (s3Resp) => {
          // 'Versioning' of image is made via HTTP ETag. We should
          // check if we have the proper version by requesting proper
          // ETag from upstream MediaWiki.
          if (s3Resp?.Metadata?.etag) {
            this.arrayBufferRequestOptions.headers['If-None-Match'] = this.removeEtagWeakPrefix(s3Resp.Metadata.etag)
          }
          // Use the base domain of the wiki being scraped as the Referer header, so that we can
          // successfully scrap WMF map tiles.
          const mwResp = await this.request({ url, method: 'GET', ...this.arrayBufferRequestOptions })

          // Most of the images, after having been uploaded once to the
          // cache, will always have 304 status, until modified. If cache
          // is up to date, return cached image. We always have an s3
          // response when mwResp is 304, since this can only happen
          // when we have an eTag coming from s3.
          if (mwResp.status === 304) {
            // Proceed with image
            const data = (await this.streamToBuffer(s3Resp.Body as Readable)) as any
            const contentType = await this.getImageMimeType(data)
            logger.info(`Using S3-cached image for ${url} (contentType: ${contentType})`)
            handler(null, {
              contentType,
              content: data,
            })
            return
          }

          // Destroy the Readable so that socket is freed and returned to the pool
          if (s3Resp?.Body) {
            s3Resp.Body.destroy()
          }

          // Compress content because image blob comes from upstream MediaWiki
          const compressedData = (await this.getCompressedBody({ data: mwResp.data })).data

          // Check for the ETag and upload to cache
          const etag = this.removeEtagWeakPrefix(mwResp.headers.etag)
          if (etag) {
            await this.s3.uploadBlob(stripHttpFromUrl(url), compressedData, etag, this.webp ? 'webp' : '1')
          }

          // get contentType from image, with fallback to response headers should the image be unsupported at all (e.g. SVG)
          const contentType = (await this.getImageMimeType(compressedData)) || mwResp.headers['content-type']
          if (s3Resp) {
            logger.info(`Using image downloaded from upstream for ${url} (S3-cached image is outdated, contentType: ${contentType})`)
          } else {
            logger.info(`Using image downloaded from upstream for ${url} (no S3-cached image found, contentType: ${contentType})`)
          }

          // Proceed with image
          handler(null, {
            contentType,
            content: compressedData,
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
    const apiUrlDirector = new ApiURLDirector(MediaWiki.actionApiUrl.href)

    const { query, continue: cont } = await this.getJSON<any>(apiUrlDirector.buildSubCategoriesURL(articleId, continueStr))
    const items = query.categorymembers.filter((a: any) => a && a.title)

    if (cont && cont.cmcontinue) {
      const nextItems = await this.getSubCategories(articleId, cont.cmcontinue)
      return items.concat(nextItems)
    } else {
      return items
    }
  }

  private backoffCall(handler: (...args: any[]) => void, url: string, kind: DonwloadKind, callback: (...args: any[]) => void | Promise<void>): void {
    const call = backoff.call(handler, url, kind, callback)
    call.setStrategy(this.backoffOptions.strategy)
    call.retryIf(this.backoffOptions.retryIf)
    call.failAfter(this.backoffOptions.failAfter)
    call.on('backoff', this.backoffOptions.backoffHandler)
    call.start()
  }

  public async getModuleDependencies(title: string) {
    const genericJsModules = config.output.mw.js
    const genericCssModules = config.output.mw.css

    const apiUrlDirector = new ApiURLDirector(MediaWiki.actionApiUrl.href)

    const articleApiUrl = apiUrlDirector.buildArticleApiURL(title)

    const articleData = await this.getJSON<any>(articleApiUrl)

    if (articleData.error) {
      const errorMessage = `Unable to retrieve js/css dependencies for article '${title}': ${articleData.error.code}`
      logger.error(errorMessage)

      /* If article is missing (for example because it just has been deleted) */
      if (articleData.error.code === 'missingtitle') {
        return { jsConfigVars: '', jsDependenciesList: [], styleDependenciesList: [] }
      }

      /* Something went wrong in modules retrieval at app level (no HTTP error) */
      throw new Error(errorMessage)
    }

    const {
      parse: { modules, modulescripts, modulestyles, headhtml },
    } = articleData

    const jsDependenciesList = genericJsModules.concat(modules, modulescripts).filter((a) => a)

    const styleDependenciesList = []
      .concat(modules, modulestyles, genericCssModules)
      .filter((a) => a)
      .filter((oneStyleDep) => !contains(config.filters.blackListCssModules, oneStyleDep))

    logger.info(`Js dependencies of ${title} : ${jsDependenciesList}`)
    logger.info(`Css dependencies of ${title} : ${styleDependenciesList}`)

    const jsConfigVars = Downloader.extractJsConfigVars(headhtml)

    // Download mobile page dependencies only once
    if ((await MediaWiki.hasWikimediaMobileApi()) && this.wikimediaMobileJsDependenciesList.length === 0 && this.wikimediaMobileStyleDependenciesList.length === 0) {
      try {
        // TODO: An arbitrary title can be placed since all Wikimedia wikis have the same mobile offline resources
        const mobileModulesData = await this.getJSON<any>(`${MediaWiki.mobileModulePath}Test`)
        mobileModulesData.forEach((module: string) => {
          if (module.includes('javascript')) {
            this.wikimediaMobileJsDependenciesList.push(module)
          } else if (module.includes('css')) {
            this.wikimediaMobileStyleDependenciesList.push(module)
          }
        })
      } catch (err) {
        throw new Error(`Error getting mobile modules ${err.message}`)
      }
    }
    return {
      jsConfigVars,
      jsDependenciesList: jsDependenciesList.concat(this.wikimediaMobileJsDependenciesList),
      styleDependenciesList: styleDependenciesList.concat(this.wikimediaMobileStyleDependenciesList),
    }
  }

  // Solution to handle aws js sdk v3 from https://github.com/aws/aws-sdk-js-v3/issues/1877
  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = []
      stream.on('data', (chunk) => chunks.push(chunk))
      stream.on('error', reject)
      stream.on('end', () => resolve(Buffer.concat(chunks)))
    })
  }

  public static extractJsConfigVars(headhtml: string) {
    let jsConfigVars = ''

    // Saving, as a js module, the jsconfigvars that are set in the header of a wikipedia page
    // the script below extracts the config with a regex executed on the page header returned from the api
    const scriptTags = domino.createDocument(`${headhtml}</body></html>`).getElementsByTagName('script')
    const regex = /mw\.config\.set\(\{.*?\}\);/gm
    for (let i = 0; i < scriptTags.length; i += 1) {
      if (scriptTags[i].text.includes('mw.config.set')) {
        jsConfigVars = regex.exec(scriptTags[i].text)[0] || ''
        jsConfigVars = `(window.RLQ=window.RLQ||[]).push(function() {${jsConfigVars}});`
      } else if (scriptTags[i].text.includes('RLCONF') || scriptTags[i].text.includes('RLSTATE') || scriptTags[i].text.includes('RLPAGEMODULES')) {
        jsConfigVars = scriptTags[i].text
      }
    }

    jsConfigVars = jsConfigVars.replace('nosuchaction', 'view') // to replace the wgAction config that is set to 'nosuchaction' from api but should be 'view'

    return jsConfigVars
  }
}

export { Downloader as DownloaderClass }

const dl = Downloader.getInstance()
export default dl as Downloader
