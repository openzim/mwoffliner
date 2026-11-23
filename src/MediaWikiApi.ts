import qs from 'querystring'
import deepmerge from 'deepmerge'
import semver from 'semver'
import * as logger from './Logger.js'
import { config } from './config.js'
import ApiURLDirector from './util/builders/url/api.director.js'
import { DB_ERROR, filterRedirects } from './util/index.js'
import { parseJsonBody } from './http/HttpClient.js'
import type { HttpClient } from './http/HttpClient.js'
import type { Gadget } from './Gadgets.js'

export interface QueryOpts {
  action: string
  format: string
  prop: string
  rdlimit: string
  rdprop: string
  ppprop: string
  clprop: string
  cllimit: string
  redirects?: boolean
  formatversion: string
  maxlag: string
}

export interface SiteInfoResponse {
  batchcomplete: boolean
  query: SiteInfoQueryResponse
  warnings?: {
    [key: string]: {
      [key: string]: string
    }
  }
}

export interface SiteInfoQueryResponse {
  general: SiteInfoGeneral
  skins: SiteInfoSkin[]
  rightsinfo: {
    url: string
    text: string
  }
  namespaces: {
    [key: string]: {
      id: number
      name: string
      canonical: string
      content: boolean
      subpages: boolean
    }
  }
  namespacealiases: {
    id: number
    alias: string
  }[]
  allmessages: {
    name: string
    content: string
  }[]
  gadgets?: Gadget[]
}

export interface SiteInfoGeneral {
  generator: string
  mainpage: string
  mainpageisdomainroot: boolean
  sitename: string
  logo: string
  lang: string
  rtl: boolean
  articlepath: string
  script: string
  scriptpath: string
  fallback: {
    code: string
  }[]
  variants?: {
    code: string
  }[]
  categorycollation: string
}

export interface SiteInfoSkin {
  code: string
  name: string
  default?: boolean
  unusable?: boolean
}

export interface MediaWikiApiOptions {
  httpClient: HttpClient
  actionApiUrl: string
  queryOpts: QueryOpts
  apiCheckPageTitle: PageTitle
  getCategories?: boolean
  versionMw?: string
  username?: string
  password?: string
  domain?: string
}

export class MediaWikiApi {
  private httpClient: HttpClient
  private actionApiUrl: URL
  private apiUrlDirector: ApiURLDirector
  private queryOpts: QueryOpts
  private apiCheckPageTitle: PageTitle
  private getCategories: boolean
  private versionMw?: string
  private username: string
  private password: string
  private domain: string
  private hasCoordinatesCache: boolean | null = null
  private hasFlaggedRevsCache: boolean | null = null

  constructor(options: MediaWikiApiOptions) {
    this.httpClient = options.httpClient
    this.actionApiUrl = new URL(options.actionApiUrl)
    this.apiUrlDirector = new ApiURLDirector(this.actionApiUrl.href)
    this.queryOpts = options.queryOpts
    this.apiCheckPageTitle = options.apiCheckPageTitle
    this.getCategories = options.getCategories ?? false
    this.versionMw = options.versionMw
    this.username = options.username ?? ''
    this.password = options.password ?? ''
    this.domain = options.domain ?? ''
  }

  setOptions(options: Partial<MediaWikiApiOptions>): void {
    if (options.httpClient) this.httpClient = options.httpClient
    if (options.actionApiUrl) {
      this.actionApiUrl = new URL(options.actionApiUrl)
      this.apiUrlDirector = new ApiURLDirector(this.actionApiUrl.href)
    }
    if (options.queryOpts) this.queryOpts = options.queryOpts
    if (options.apiCheckPageTitle) this.apiCheckPageTitle = options.apiCheckPageTitle
    if (options.getCategories !== undefined) this.getCategories = options.getCategories
    if ('versionMw' in options) this.versionMw = options.versionMw
    if (options.username !== undefined) this.username = options.username
    if (options.password !== undefined) this.password = options.password
    if (options.domain !== undefined) this.domain = options.domain
  }

  reset(): void {
    this.hasCoordinatesCache = null
    this.hasFlaggedRevsCache = null
  }

  querySiteInfo(): Promise<SiteInfoResponse> {
    return this.httpClient.getJSON<SiteInfoResponse>(this.apiUrlDirector.buildSiteInfoURL())
  }

  async hasCoordinates(): Promise<boolean> {
    if (this.hasCoordinatesCache === null) {
      const reqOpts = {
        ...this.queryOpts,
        prop: this.queryOpts.prop + '|coordinates',
      }
      const resp = await this.httpClient.getJSON<MwApiResponse>(this.apiUrlDirector.buildQueryURL(reqOpts))
      const isCoordinateWarning = JSON.stringify(resp?.warnings?.query ?? '').includes('coordinates')
      if (isCoordinateWarning) {
        logger.info('Coordinates not available on this wiki')
        this.hasCoordinatesCache = false
      } else {
        logger.info('Coordinates available on this wiki')
        this.hasCoordinatesCache = true
      }
    }
    return this.hasCoordinatesCache
  }

  async hasFlaggedRevs(): Promise<boolean> {
    if (this.hasFlaggedRevsCache === null) {
      const reqOpts = {
        ...this.queryOpts,
        prop: 'info|flagged',
        titles: this.apiCheckPageTitle,
      }
      const resp = await this.httpClient.getJSON<MwApiResponse>(this.apiUrlDirector.buildQueryURL(reqOpts))
      const isFlaggedWarning = JSON.stringify(resp?.warnings?.query ?? '').includes('flagged')
      if (isFlaggedWarning) {
        logger.info('FlaggedRevs not available on this wiki')
        this.hasFlaggedRevsCache = false
      } else {
        logger.info('FlaggedRevs available on this wiki')
        this.hasFlaggedRevsCache = true
      }
    }
    return this.hasFlaggedRevsCache
  }

  async getPagesByTitle(pageTitles: PageTitle[], shouldGetThumbnail = false, followRedirects = true): Promise<QueryMwRet> {
    let continuation: ContinueOpts
    let allPages: { [key: string]: PageInfo & QueryRet } = {}
    const visitedUrls = new Set<string>()

    while (true) {
      const queryOpts: KVS<any> = {
        ...(await this.getPageQueryOpts(shouldGetThumbnail, followRedirects)),
        titles: pageTitles.join('|'),
        ...((await this.hasCoordinates()) ? { colimit: 'max' } : {}),
        ...(this.getCategories
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

      const resp = await this.httpClient.getJSON<MwApiResponse>(reqUrl)
      this.handleWarningsAndErrors(resp)
      const pages = Object.values(resp.query?.pages ?? {})
      pages.forEach((page) => filterRedirects(page))

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

  async getPagesByNamespace(namespace: number, requestGapcontinue = ''): Promise<{ gapContinue: string; pages: QueryMwRet }> {
    let queryContinuation: QueryContinueOpts = null
    let allPages: { [key: string]: PageInfo & QueryRet } = {}
    const visitedUrls = new Set<string>()

    while (true) {
      const queryOpts: KVS<any> = {
        ...(await this.getPageQueryOpts()),
        ...((await this.hasCoordinates()) ? { colimit: 'max' } : {}),
        ...(this.getCategories ? (semver.satisfies(this.versionMw ?? '0.0.0', '>=1.46') ? { cllimit: 'max' } : { cllimit: 'max', clshow: '!hidden' }) : {}),
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

      const resp = await this.httpClient.getJSON<MwApiResponse>(reqUrl)
      this.handleWarningsAndErrors(resp)
      const pages = Object.values(resp.query?.pages ?? {})
      pages.forEach((page) => filterRedirects(page))

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

  async getLogEvents(letype: string, pageTitle: PageTitle): Promise<any> {
    const logEventsData = await this.httpClient.getJSON<any>(this.apiUrlDirector.buildLogEventsQuery(letype, pageTitle))
    return logEventsData.query?.logevents
  }

  async login(mightBeAlreadyLoggedIn = false): Promise<void> {
    if (!this.username || !this.password) {
      return
    }

    let tokenUrl = `${this.actionApiUrl.href}?`
    if (this.domain) {
      tokenUrl += `lgdomain=${this.domain}&`
    }
    tokenUrl += `action=query&meta=tokens&type=login&format=json&formatversion=2&maxlag=${config.defaults.maxlag}`

    const tokenResponse = await this.httpClient.getJSON<any>(tokenUrl)
    const loginResponse = await this.httpClient.request<any>({
      method: 'POST',
      url: this.actionApiUrl.href,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: qs.stringify({
        action: 'login',
        format: 'json',
        lgname: this.username,
        lgpassword: this.password,
        lgtoken: tokenResponse.query.tokens.logintoken,
      }),
    })
    const data = parseJsonBody<any>(loginResponse, this.actionApiUrl.href)

    if (data.login?.result !== 'Success') {
      const reason = data.login?.reason
      if (reason) {
        if (mightBeAlreadyLoggedIn && reason.includes('Cannot log in when using MediaWiki\\Session\\BotPasswordSessionProvider sessions')) {
          logger.info('Already logged in')
        } else {
          logger.error(reason)
          throw new Error('Login Failed')
        }
      } else {
        throw new Error('Login Failed')
      }
    } else {
      logger.info('Login Success')
    }
  }

  private handleWarningsAndErrors(resp: MwApiResponse): void {
    if (resp.warnings) logger.warn(`Got warning from MW Query ${JSON.stringify(resp.warnings, null, '\t')}`)
    if (resp.error?.code === DB_ERROR) throw new Error(`Got error from MW Query ${JSON.stringify(resp.error, null, '\t')}`)
    if (resp.error) logger.info(`Got error from MW Query ${JSON.stringify(resp.warnings, null, '\t')}`)
  }

  private async getPageQueryOpts(includePageimages = false, followRedirects = false): Promise<QueryOpts> {
    const prop = `${includePageimages ? '|pageimages' : ''}${(await this.hasCoordinates()) ? '|coordinates' : ''}${this.getCategories ? '|categories' : ''}${
      (await this.hasFlaggedRevs()) ? '|flagged' : ''
    }`
    return {
      ...this.queryOpts,
      prop: this.queryOpts.prop.concat(prop),
      formatversion: '2',
      redirects: followRedirects ? true : undefined,
    }
  }
}

export default MediaWikiApi
