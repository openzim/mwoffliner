import * as backoff from 'backoff'
import { config } from './config.js'
import { filterRedirects, DB_ERROR, WEAK_ETAG_REGEX, stripHttpFromUrl, isBitmapImageMimeType, isWebpCandidateImageMimeType, makeZimPath } from './util/index.js'
import { Readable } from 'stream'
import type { BackoffStrategy } from 'backoff'
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
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

import ActionParseURLDirector from './util/builders/url/action-parse.director.js'
import { Renderer } from './renderers/abstract.renderer.js'
import { findFirstMatchingRule, renderDownloadError } from './error.manager.js'
import RedisStore from './RedisStore.js'
import deepmerge from 'deepmerge'

interface DownloaderOpts {
  uaString: string
  workers: number
  pageRequestInterval?: number
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

function isJsonContentType(contentType: string | null): boolean {
  return typeof contentType === 'string' && /\b(?:application\/json|[\w.-]+\+json)\b/i.test(contentType)
}

function isMalformedJsonResponseError(err: unknown): boolean {
  if (err instanceof SyntaxError) {
    return true
  }

  if (!axios.isAxiosError(err) || err.code !== AxiosError.ERR_BAD_RESPONSE) {
    return false
  }

  return err.cause instanceof SyntaxError
}

function parseJsonResponse<T>(url: string, status: number, contentType: string | null, body: unknown): T {
  if (body !== null && typeof body === 'object') {
    return body as T
  }

  if (typeof body !== 'string') {
    return body as T
  }

  if (!isJsonContentType(contentType)) {
    throw new DownloadError('Unexpected non-JSON response while calling API', url, status, contentType, body)
  }

  return JSON.parse(body) as T
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

type URLDirector = ActionParseURLDirector
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
  private _workers: number
  private _pageRequestInterval: number
  private _webp: boolean = false
  private _requestTimeout: number
  private _basicRequestOptions: AxiosRequestConfig
  private _arrayBufferRequestOptions: AxiosRequestConfig
  private _jsonRequestOptions: AxiosRequestConfig
  private _streamRequestOptions: AxiosRequestConfig
  public trustedJs: string[] = []
  public customCssUrls: string[] = []
  public customJsUrls: string[] = []
  public mathJaxSource: string | null = null
  public mathJaxConfig: string | null = null
  public mathJaxConfigScript: string | null = null
  public mathJaxEntryPoint: string = 'MathJax.js'
  public mathJaxAllPages = false

  private uaString: string
  private backoffOptions: BackoffOptions
  private optimisationCacheUrl: string
  private s3: S3
  private _apiUrlDirector: ApiURLDirector
  private cookierJar: CookieJar

  private pageUrlDirector: URLDirector
  private insecure: boolean = false

  get workers() {
    return this._workers
  }

  get pageRequestInterval() {
    return this._pageRequestInterval
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

  set init({
    uaString,
    workers,
    pageRequestInterval,
    reqTimeout,
    optimisationCacheUrl,
    s3,
    webp,
    trustedJs = config.output.mw.js_trusted.slice(),
    backoffOptions,
    insecure,
  }: DownloaderOpts) {
    this.reset()
    this.uaString = uaString
    this._workers = workers
    this._pageRequestInterval = pageRequestInterval
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
        if (isMalformedJsonResponseError(err)) {
          logger.info(`Retrying ${requestedUrl} due to malformed JSON response`)
          return true
        }

        if (err instanceof AxiosError && err.code && !['ERR_BAD_REQUEST', 'ERR_BAD_RESPONSE'].includes(err.code)) {
          logger.info(`Retrying ${requestedUrl} URL due to ${err.code} error`)
          return true // retry all connection issues
        }
        if (err.responseData?.error?.code === 'maxlag') {
          logger.info(`Mediawiki server is lagging ${err.responseData?.error?.lag}s; retrying in few seconds`)
          return true // note that we do not honor Retry-After header value because it is not possible in current code architecture
        }
        const httpReturnCode = err.response?.status || err.httpReturnCode
        if ([429, 500, 502, 503, 504, 524].includes(httpReturnCode)) {
          logger.info(`Retrying ${requestedUrl} URL due to HTTP ${httpReturnCode} error`)
          return true // retry these HTTP status codes
        }
        if (
          err.responseData?.error?.code &&
          ![
            'missingtitle',
            'readapidenied',
            'permissiondenied',
            'internal_api_error_MediaWiki\\Revision\\BadRevisionException',
            'internal_api_error_Wikimedia\\Assert\\UnreachableException',
            'internal_api_error_Wikimedia\\Assert\\InvariantException',
            'internal_api_error_Wikimedia\\Parsoid\\Core\\ResourceLimitExceededException',
          ].includes(err.responseData?.error?.code)
        ) {
          logger.info(`Retrying ${requestedUrl} URL due to ${err.responseData?.error?.code} Mediawiki error`)
          return true // retry these Mediawiki codes which are known to be transient
        }
        return false // don't retry other errors
      },
      backoffHandler: (number: number, delay: number) => {
        logger.debug(`[backoff] #${number} after ${delay} ms`)
      },
      ...backoffOptions,
    }

    this._basicRequestOptions = {
      // HTTP agent pools with 'keepAlive' to reuse TCP connections, so it's faster
      // Set cookie jar and use special Http(s)CookieAgent so that cookies are automatically intercepted and persisted across calls
      httpAgent: new HttpCookieAgent({ cookies: { jar: this.cookierJar as any }, keepAlive: true }),
      httpsAgent: new HttpsCookieAgent({ cookies: { jar: this.cookierJar as any }, keepAlive: true, rejectUnauthorized: !this.insecure }), // rejectUnauthorized: false disables TLS
      timeout: this.requestTimeout,
      headers: {
        // Use the base domain of the wiki being scraped as the Referer header, so that we can
        // successfully scrape WMF map tiles.
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
      responseType: 'text',
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
    this._workers = undefined
    this._pageRequestInterval = undefined
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

    this.pageUrlDirector = undefined
  }

  /**
   * Destroys HTTP agents to properly close all connections.
   * This is required for tests to prevent "Jest environment has been torn down" errors.
   * Safe to call multiple times (idempotent).
   */
  public async destroy(): Promise<void> {
    try {
      if (this._basicRequestOptions?.httpAgent && typeof this._basicRequestOptions.httpAgent.destroy === 'function') {
        this._basicRequestOptions.httpAgent.destroy()
      }
    } catch {
      // Ignore errors from destroying agents
    }

    try {
      if (this._basicRequestOptions?.httpsAgent && typeof this._basicRequestOptions.httpsAgent.destroy === 'function') {
        this._basicRequestOptions.httpsAgent.destroy()
      }
    } catch {
      // Ignore errors from destroying agents
    }
  }

  private getUrlDirector(renderer: object): URLDirector {
    switch (renderer.constructor.name) {
      case 'ActionParseRenderer':
        return MediaWiki.actionParseUrlDirector
      /* istanbul ignore next */
      default:
        throw new Error(`Unknown renderer ${renderer.constructor.name}`)
    }
  }

  public setUrlsDirectors(pagesRenderer: Renderer): void {
    this.pageUrlDirector = this.getUrlDirector(pagesRenderer)
  }

  public getPageUrl(pageTitle: PageTitle, pageUrlOpts: PageUrlOpts = {}): string {
    return this.pageUrlDirector.buildPageUrl(pageTitle, pageUrlOpts)
  }

  public removeEtagWeakPrefix(etag: string): string {
    return etag && etag.replace(WEAK_ETAG_REGEX, '')
  }

  public querySiteInfo(): Promise<SiteInfoResponse> {
    return this.getJSON<SiteInfoResponse>(this.apiUrlDirector.buildSiteInfoURL())
  }

  public async getPagesByTitle(pageTitles: PageTitle[], shouldGetThumbnail = false): Promise<QueryMwRet> {
    let continuation: ContinueOpts
    let allPages: { [key: string]: PageInfo & QueryRet } = {}
    const visitedUrls = new Set<string>()

    while (true) {
      const queryOpts: KVS<any> = {
        ...(await this.getPageQueryOpts(shouldGetThumbnail, true)),
        titles: pageTitles.join('|'),
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
      if (visitedUrls.has(reqUrl)) {
        throw new Error(`Detected continuation cycle while fetching page details by IDs. ` + `visitedUrls=[\n${[...visitedUrls].join('\n')}\n]`)
      }
      visitedUrls.add(reqUrl)

      const resp = await this.getJSON<MwApiResponse>(reqUrl)
      Downloader.handleMWWarningsAndErrors(resp)
      const pages = Object.values(resp.query?.pages)
      pages.forEach((page) => filterRedirects(page))

      /* deepmerge because a single page data might be split over multiple API results pages */
      allPages = deepmerge(
        allPages,
        pages.reduce((acc, page) => {
          acc[page.title] = page
          return acc
        }, {}),
      )

      continuation = resp.continue
      if (!continuation) {
        break
      }
    }

    return Object.values(allPages)
  }

  public async getPagesByNamespace(namespace: number, requestGapcontinue = ''): Promise<{ gapContinue: string; pages: QueryMwRet }> {
    let queryContinuation: QueryContinueOpts = null
    let allPages: { [key: string]: PageInfo & QueryRet } = {}
    const visitedUrls = new Set<string>()

    while (true) {
      const queryOpts: KVS<any> = {
        ...(await this.getPageQueryOpts()),
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
        gapnamespace: String(namespace),
        gapcontinue: requestGapcontinue,
      }

      if (queryContinuation) {
        queryOpts.cocontinue = queryContinuation?.coordinates?.cocontinue ?? queryOpts.cocontinue
        queryOpts.clcontinue = queryContinuation?.categories?.clcontinue ?? queryOpts.clcontinue
        queryOpts.picontinue = queryContinuation?.pageimages?.picontinue ?? queryOpts.picontinue
        queryOpts.rdcontinue = queryContinuation?.redirects?.rdcontinue ?? queryOpts.rdcontinue
      }

      const reqUrl = this.apiUrlDirector.buildQueryURL(queryOpts)
      if (visitedUrls.has(reqUrl)) {
        throw new Error(`Detected continuation cycle while fetching pages details in namespace ${namespace}. ` + `visitedUrls=[\n${[...visitedUrls].join('\n')}\n]`)
      }
      visitedUrls.add(reqUrl)

      const resp = await this.getJSON<MwApiResponse>(reqUrl)
      Downloader.handleMWWarningsAndErrors(resp)
      const pages = Object.values(resp.query?.pages || {})
      pages.forEach((page) => filterRedirects(page))

      /* deepmerge because a single page data might be split over multiple API results pages */
      allPages = deepmerge(
        allPages,
        pages.reduce((acc, page) => {
          acc[page.title] = page
          return acc
        }, {}),
      )

      queryContinuation = resp['query-continue']
      const queryComplete = Object.keys(queryContinuation || {}).filter((key) => key !== 'allpages').length === 0
      if (queryComplete) {
        break
      }
    }

    return {
      pages: Object.values(allPages),
      gapContinue: queryContinuation?.allpages?.gapcontinue || null,
    }
  }

  public async getLogEvents(letype: string, pageTitle: PageTitle): Promise<any> {
    const logEventsData = await this.getJSON<any>(this.apiUrlDirector.buildLogEventsQuery(letype, pageTitle))
    return logEventsData.query?.logevents
  }

  public async getPage(pageTitle: PageTitle, pageRenderer: Renderer, pageUrl, dump: Dump, pageDetail?: PageDetail): Promise<RenderOutput> {
    logger.debug(`Getting page [${pageTitle}] from ${pageUrl}`)

    try {
      const {
        data,
        moduleDependencies,
        redirects,
        displayTitle,
        subtitle,
        categoriesHtml = '',
        bodyCssClass,
        htmlCssClass,
      } = await pageRenderer.download({
        pageTitle,
        pageUrl,
        pageDetail,
        langVar: dump.langVar,
      })

      // Cope with the fact that the page we are fetching might have been moved and replaced by a redirect
      // In such a case, the download above is expected to follow the redirect so that we have proper original
      // content at original page path, but we probably need to add a redirect since new page location
      // probably did not existed when listing pages (might have existed if the move occured during page
      // listing). The redirect we add in hence in the "opposite" direction than usual, i.e. it will redirect
      // from new location to original location. Note that only ActionParse API gives proper redirects info.
      for (const redirect of redirects) {
        if (!(await RedisStore.pagesStore.exists(redirect.to)) && !(await RedisStore.redirectsStore.exists(redirect.to))) {
          await RedisStore.redirectsStore.set(redirect.to, { to: redirect.from, from: redirect.to, fragment: '' })
        }
      }

      let categoryMembers: GroupedCategoryMembers = null
      if (pageDetail.categoryinfo?.size) {
        categoryMembers = await this.getCategoryMembers(pageTitle, { ...pageDetail.categoryinfo })
        if (MediaWiki.getCategories) {
          categoryMembers.categoryinfo.subcats = categoryMembers.subcats.length
          categoryMembers.categoryinfo.pages = categoryMembers.pages.length
          categoryMembers.categoryinfo.files = categoryMembers.files.length
        }
      }

      return await pageRenderer.render({
        data,
        moduleDependencies,
        pageTitle,
        pageDetail,
        displayTitle,
        subtitle,
        categoryMembers,
        categoriesHtml,
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
        `Page ${pageTitle} failed to download from '${downloadErrorContext.urlCalled}' with ` +
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
        logger.info(`This is a hard ${errorRule.detailsMessageKey} error which will be replaced by a placeholder`)
        dump.status.pages.hardFail += 1
        dump.status.pages.hardFailedPages.push(pageTitle)
        if (dump.maxHardFailedPages > 0 && dump.status.pages.hardFail > dump.maxHardFailedPages) {
          throw new Error('Too many pages failed to download') // eslint-disable-line preserve-caught-error
        }
      } else {
        logger.info(`This is a soft ${errorRule.detailsMessageKey} error which will be replaced by a placeholder`)
        dump.status.pages.softFail += 1
        dump.status.pages.softFailedPages.push(pageTitle)
      }
      await RedisStore.pagesStore.delete(pageTitle) // Remove page from list so that we stop creating links to this placeholder
      const errorPlaceholderHtml = renderDownloadError(errorRule, dump, pageTitle)
      return {
        items: [
          {
            pageTitle,
            zimPath: makeZimPath(pageTitle),
            zimTitle: '', // we do not want these failed downloads to end-up in suggestion search
            htmlContent: errorPlaceholderHtml,
          },
        ],
        mediaDependencies: [],
        imageDependencies: [],
        videoDependencies: [],
        moduleDependencies: [],
        subtitles: [],
        needsDownloadErrorStaticFiles: true,
      }
    }
  }

  public async getJSON<T>(_url: string): Promise<T> {
    const url = urlHelper.deserializeUrl(_url)
    return new Promise<T>((resolve, reject) => {
      this.backoffCall(this.getJSONCb, url, 'json', undefined, (err: any, val: any) => {
        if (err) {
          const httpStatus = (err.response && err.response.status) || err.httpReturnCode
          logger.debug(`Failed to get [${url}] [status=${httpStatus}]`)
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

  public async downloadContent(
    _url: string,
    kind: DownloadKind,
    retry = true,
    requestedWidth?: number,
  ): Promise<{ content: Buffer | string; contentType: string; setCookie: string | null }> {
    if (!_url) {
      throw new Error(`Parameter [${_url}] is not a valid url`)
    }

    let url = urlHelper.deserializeUrl(_url)
    if (url.startsWith('//')) {
      url = `${MediaWiki.baseUrl.protocol}${url}`
    }

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
          this.backoffCall(this.getContentCb, url, kind, requestedWidth, cb)
        } else {
          this.getContentCb(url, kind, requestedWidth, cb)
        }
      })
    } catch (err) {
      const e = err as any
      const httpStatus = e.response && e.response.status
      logger.warn(`Failed to get [${url}] [status=${httpStatus}]`)
      throw err
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
    if (resp.error) logger.info(`Got error from MW Query ${JSON.stringify(resp.warnings, null, '\t')}`)
  }

  private async getPageQueryOpts(includePageimages = false, followRedirects = false): Promise<QueryOpts> {
    const prop = `${includePageimages ? '|pageimages' : ''}${(await MediaWiki.hasCoordinates()) ? '|coordinates' : ''}${MediaWiki.getCategories ? '|categories' : ''}${(await MediaWiki.hasFlaggedRevs()) ? '|flagged' : ''}`
    return {
      ...MediaWiki.queryOpts,
      prop: MediaWiki.queryOpts.prop.concat(prop),
      formatversion: '2',
      redirects: followRedirects ? true : undefined,
    }
  }

  private getJSONCb = <T>(url: string, kind: DownloadKind, _requestedWidth: number | undefined, handler: (...args: any[]) => any): void => {
    logger.debug(`Getting JSON from [${url}]`)
    this.request<T>({ url, method: 'GET', ...this.jsonRequestOptions })
      .then((val) => {
        const contentType = val.headers['content-type']?.toString() || null
        const data = parseJsonResponse<T>(url, val.status, contentType, val.data)

        if ((data as any).error) {
          handler(new DownloadError(`Error returned while calling API`, url, val.status, contentType, data))
        } else {
          handler(null, data)
        }
      })
      .catch((err) => {
        if (isMalformedJsonResponseError(err)) {
          logger.warn(`Malformed JSON from [${url}] → ${err.message}`)
        }
        handler(err)
      })
  }

  private async getImageMimeType(data: any): Promise<string | null> {
    const fileType = await fileTypeFromBuffer(data)
    if (fileType && fileType.mime === 'application/xml') {
      // File type is known to be wrong, might be SVG
      return null
    }
    return fileType ? fileType.mime : null
  }

  private async compressDefault(data: Buffer, contentType: string): Promise<Buffer> {
    if (contentType === 'image/png') {
      return await sharp(data).png({ palette: true, quality: 60, effort: 7 }).toBuffer()
    } else if (contentType === 'image/jpeg') {
      return await sharp(data).jpeg({ quality: 60, mozjpeg: true }).toBuffer()
    } else if (contentType === 'image/gif') {
      return await sharp(data, { animated: true }).gif({ colours: 64, effort: 7 }).toBuffer()
    }
  }

  private async getCompressedBody(input: CompressionData, requestedWidth?: number): Promise<CompressionData> {
    const contentType = await this.getImageMimeType(input.data)
    if (isBitmapImageMimeType(contentType)) {
      // Resize down with sharp before compression when the source is wider
      // than the requested display width. Skip GIFs to avoid breaking animations.
      let dataToCompress = input.data
      if (requestedWidth && contentType !== 'image/gif') {
        try {
          const metadata = await sharp(input.data).metadata()
          if (metadata.width && metadata.width > requestedWidth) {
            dataToCompress = await sharp(input.data).resize({ width: requestedWidth, withoutEnlargement: true }).toBuffer()
          }
        } catch (err) {
          logger.warn(`Failed to resize image to ${requestedWidth}px, proceeding without resize: ${(err as any).message}`)
        }
      }

      if (this.webp && isWebpCandidateImageMimeType(contentType)) {
        try {
          return { data: await sharp(dataToCompress).webp({ quality: 50, effort: 6 }).toBuffer() }
        } catch {
          return { data: await this.compressDefault(dataToCompress, contentType) }
        }
      } else {
        return { data: await this.compressDefault(dataToCompress, contentType) }
      }
    }
    return {
      data: input.data,
    }
  }

  private getContentCb = async (url: string, kind: DownloadKind, requestedWidth: number | undefined, handler: any): Promise<void> => {
    logger.debug(`Downloading [${url}]`)
    try {
      if (this.optimisationCacheUrl && kind === 'image') {
        this.downloadImage(url, handler, requestedWidth)
      } else {
        const resp = await this.request({ url, method: 'GET', ...this.arrayBufferRequestOptions })
        // If content is an image, we might benefit from compressing it
        const content = kind === 'image' ? (await this.getCompressedBody({ data: resp.data }, requestedWidth)).data : resp.data
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

  private async downloadImage(url: string, handler: any, requestedWidth?: number) {
    // Build a width-aware cache version token so the same URL at different
    // requested widths does not reuse an undersized cached image.
    const cacheVersion = this.webp ? (requestedWidth ? `webp-w${requestedWidth}` : 'webp') : requestedWidth ? `1-w${requestedWidth}` : '1'

    try {
      this.s3

        // Check first if we have an entry in the (object storage) cache for this URL
        .downloadBlob(stripHttpFromUrl(url), cacheVersion)

        // Handle the cache response and act accordingly
        .then(async (s3Resp) => {
          // 'Versioning' of image is made via HTTP ETag. We should
          // check if we have the proper version by requesting proper
          // ETag from upstream MediaWiki.
          if (s3Resp?.Metadata?.etag) {
            this.arrayBufferRequestOptions.headers['If-None-Match'] = this.removeEtagWeakPrefix(s3Resp.Metadata.etag)
          }
          // Use the base domain of the wiki being scraped as the Referer header, so that we can
          // successfully scrape WMF map tiles.
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
            logger.debug(`Using S3-cached image for ${url} (contentType: ${contentType})`)
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
          const compressedData = (await this.getCompressedBody({ data: mwResp.data }, requestedWidth)).data

          // Check for the ETag and upload to cache
          const etag = this.removeEtagWeakPrefix(mwResp.headers.etag)
          if (etag) {
            await this.s3.uploadBlob(stripHttpFromUrl(url), compressedData, etag, cacheVersion)
          }

          // get contentType from image, with fallback to response headers should the image be unsupported at all (e.g. SVG)
          const contentType = (await this.getImageMimeType(compressedData)) || mwResp.headers['content-type']
          if (s3Resp) {
            logger.debug(`Using image downloaded from upstream for ${url} (S3-cached image is outdated, contentType: ${contentType})`)
          } else {
            logger.debug(`Using image downloaded from upstream for ${url} (no S3-cached image found, contentType: ${contentType})`)
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
    logger.debug(`Error while downloading content for ${url} due to ${err} ; might be retried`)
    handler(err)
  }

  private async getCategoryMembers(pageTitle: PageTitle, categoryinfo: CategoryInfo, continueStr = ''): Promise<GroupedCategoryMembers> {
    const apiUrlDirector = new ApiURLDirector(MediaWiki.actionApiUrl.href)

    const { query, continue: cont } = await this.getJSON<any>(apiUrlDirector.buildCategoryMembersURL(pageTitle, continueStr))
    const items: Array<CategoryMember> = query.categorymembers.filter((a: CategoryMember) => {
      const sortkey = a.sortkeyprefix + ((a.ns && a.title.split(':').slice(1).join(':')) || a.title)
      a.sortkeyprefix = [...sortkey][0]
      return a && a.title
    })
    const pagesInZim = MediaWiki.getCategories ? await RedisStore.pagesStore.existsMany(items.map((a) => a.title)) : null
    const subcats = items.filter((a) => a.type === 'subcat' && (pagesInZim ? pagesInZim[a.title] : true))
    const pages = items.filter((a) => a.type === 'page' && (pagesInZim ? pagesInZim[a.title] : true))
    const files = items.filter((a) => a.type === 'file' && (pagesInZim ? pagesInZim[a.title] : true))

    if (cont && cont.cmcontinue) {
      const nextItems = await this.getCategoryMembers(pageTitle, categoryinfo, cont.cmcontinue)
      return {
        subcats: subcats.concat(nextItems.subcats),
        pages: pages.concat(nextItems.pages),
        files: files.concat(nextItems.files),
        categoryinfo,
      }
    } else {
      return { subcats, pages, files, categoryinfo }
    }
  }

  private backoffCall(
    handler: (...args: any[]) => void,
    url: string,
    kind: DownloadKind,
    requestedWidth: number | undefined,
    callback: (...args: any[]) => void | Promise<void>,
  ): void {
    this.backoffOptions.strategy.reset() // reset delay to initial one at each call
    const call = backoff.call(handler, url, kind, requestedWidth, callback)
    call.setStrategy(this.backoffOptions.strategy)
    call.retryIf(this.backoffOptions.retryIf)
    call.failAfter(this.backoffOptions.failAfter)
    call.on('backoff', this.backoffOptions.backoffHandler)
    call.start()
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
}

export { Downloader as DownloaderClass }

const dl = Downloader.getInstance()
export default dl as Downloader
