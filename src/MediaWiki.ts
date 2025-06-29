import * as pathParser from 'path'
import * as logger from './Logger.js'
import * as util from './util/index.js'
import * as domino from 'domino'
import Downloader from './Downloader.js'
import qs from 'querystring'
import semver from 'semver'
import basicURLDirector from './util/builders/url/basic.director.js'
import BaseURLDirector from './util/builders/url/base.director.js'
import ApiURLDirector from './util/builders/url/api.director.js'
import WikimediaDesktopURLDirector from './util/builders/url/desktop.director.js'
import WikimediaMobileURLDirector from './util/builders/url/mobile.director.js'
import VisualEditorURLDirector from './util/builders/url/visual-editor.director.js'
import RestApiURLDirector from './util/builders/url/rest-api.director.js'
import ActionParseURLDirector from './util/builders/url/action-parse.director.js'
import { checkApiAvailability } from './util/mw-api.js'
import { BLACKLISTED_NS } from './util/const.js'

export interface QueryOpts {
  action: string
  format: string
  prop: string
  rdlimit: string
  rdnamespace: string | number
  redirects?: boolean
  formatversion: string
}

class MediaWiki {
  private static instance: MediaWiki

  public static getInstance(): MediaWiki {
    if (!MediaWiki.instance) {
      MediaWiki.instance = new MediaWiki()
    }
    return MediaWiki.instance
  }

  public metaData: MWMetaData
  public baseUrl: URL
  public getCategories: boolean
  public namespaces: MWNamespaces = {}
  public namespacesToMirror: string[] = []
  public apiCheckArticleId: string
  public queryOpts: QueryOpts
  public urlDirector: BaseURLDirector
  public skin = 'vector' // Default fallback

  #wikiPath: string
  #indexPhpPath: string
  #actionApiPath: string
  #modulePathOpt: string
  #restApiPath: string
  #username: string
  #password: string
  #domain: string

  public wikimediaDesktopUrlDirector: WikimediaDesktopURLDirector
  public wikimediaMobileUrlDirector: WikimediaMobileURLDirector
  public visualEditorUrlDirector: VisualEditorURLDirector
  public restApiUrlDirector: RestApiURLDirector
  public actionParseUrlDirector: ActionParseURLDirector

  public visualEditorApiUrl: URL
  public actionApiUrl: URL
  public restApiUrl: URL
  public webUrl: URL
  public wikimediaDesktopApiUrl: URL
  public wikimediaMobileApiUrl: URL

  public modulePath: string // only for reading
  public mobileModulePath: string

  #apiUrlDirector: ApiURLDirector
  #hasWikimediaDesktopApi: boolean | null
  #hasWikimediaMobileApi: boolean | null
  #hasVisualEditorApi: boolean | null
  #hasRestApi: boolean | null
  #hasActionParseApi: boolean | null
  #hasCoordinates: boolean | null
  #hasModuleApi: boolean | null

  set username(value: string) {
    this.#username = value
  }

  set password(value: string) {
    this.#password = value
  }

  set actionApiPath(value: string) {
    if (value) {
      this.#actionApiPath = value
      this.actionApiUrl = this.urlDirector.buildURL(this.#actionApiPath)
      this.setVisualEditorURL()
    }
  }

  set restApiPath(value: string) {
    if (value) {
      this.#restApiPath = value
      this.setRestApiURL()
    }
  }

  set domain(value: string) {
    this.#domain = value
  }

  set wikiPath(value: string) {
    if (value) {
      this.#wikiPath = value
      this.webUrl = this.urlDirector.buildURL(this.#wikiPath)
      logger.log(`webUrl: ${this.webUrl}`)
    }
  }

  set indexPhpPath(value: string) {
    if (value) {
      this.#indexPhpPath = value
    }
  }

  set base(value: string) {
    if (value) {
      this.baseUrl = basicURLDirector.buildMediawikiBaseURL(value)
      this.urlDirector = new BaseURLDirector(this.baseUrl.href)
      this.webUrl = this.urlDirector.buildURL(this.#wikiPath)
      this.actionApiUrl = this.urlDirector.buildURL(this.#actionApiPath)
      this.setWikimediaDesktopApiUrl()
      this.setWikimediaMobileApiUrl()
      this.setRestApiURL()
      this.setVisualEditorURL()
      this.setModuleURL()
      this.setMobileModuleUrl()
    }
  }

  set modulePathOpt(value: string) {
    if (value !== undefined) {
      this.#modulePathOpt = value
    }

    if (this.urlDirector) {
      this.setModuleURL()
    } else if (value) {
      logger.error('Base url director should be specified first')
    }
  }

  private initializeMediaWikiDefaults(): void {
    this.#domain = ''
    this.#username = ''
    this.#password = ''
    this.getCategories = false

    this.#actionApiPath = '/w/api.php'
    this.#restApiPath = '/w/rest.php'
    this.#wikiPath = '/wiki/'
    this.#indexPhpPath = '/w/index.php'
    this.#modulePathOpt = '/w/load.php'

    this.namespaces = {}
    this.namespacesToMirror = []
    this.apiCheckArticleId = 'MediaWiki:Sidebar'

    this.queryOpts = {
      action: 'query',
      format: 'json',
      prop: 'info|redirects|revisions',
      rdlimit: 'max',
      rdnamespace: 0,
      redirects: false,
      formatversion: '2',
    }

    this.#hasWikimediaDesktopApi = null
    this.#hasWikimediaMobileApi = null
    this.#hasVisualEditorApi = null
    this.#hasRestApi = null
    this.#hasActionParseApi = null
    this.#hasCoordinates = null
    this.#hasModuleApi = null
  }

  private constructor() {
    this.initializeMediaWikiDefaults()
  }

  public async hasWikimediaDesktopApi(): Promise<boolean> {
    if (this.#hasWikimediaDesktopApi === null) {
      this.wikimediaDesktopUrlDirector = new WikimediaDesktopURLDirector(this.wikimediaDesktopApiUrl.href)
      const checkUrl = this.wikimediaDesktopUrlDirector.buildArticleURL(this.apiCheckArticleId)
      this.#hasWikimediaDesktopApi = await checkApiAvailability(checkUrl)
      logger.log('Checked for WikimediaDesktopApi at', checkUrl, '-- result is: ', this.#hasWikimediaDesktopApi)
    }
    return this.#hasWikimediaDesktopApi
  }

  public async hasWikimediaMobileApi(): Promise<boolean> {
    if (this.#hasWikimediaMobileApi === null) {
      this.wikimediaMobileUrlDirector = new WikimediaMobileURLDirector(this.wikimediaMobileApiUrl.href)
      const checkUrl = this.wikimediaMobileUrlDirector.buildArticleURL(this.apiCheckArticleId)
      this.#hasWikimediaMobileApi = await checkApiAvailability(checkUrl)
      logger.log('Checked for WikimediaMobileApi at', checkUrl, '-- result is: ', this.#hasWikimediaMobileApi)
    }
    return this.#hasWikimediaMobileApi
  }

  public async hasVisualEditorApi(): Promise<boolean> {
    if (this.#hasVisualEditorApi === null) {
      this.visualEditorUrlDirector = new VisualEditorURLDirector(this.visualEditorApiUrl.href)
      const checkUrl = this.visualEditorUrlDirector.buildArticleURL(this.apiCheckArticleId)
      this.#hasVisualEditorApi = await checkApiAvailability(checkUrl, this.visualEditorUrlDirector.validMimeTypes)
      logger.log('Checked for VisualEditorApi at', checkUrl, '-- result is: ', this.#hasVisualEditorApi)
    }
    return this.#hasVisualEditorApi
  }

  public async hasRestApi(): Promise<boolean> {
    if (this.#hasRestApi === null) {
      this.restApiUrlDirector = new RestApiURLDirector(this.restApiUrl.href)
      const checkUrl = this.restApiUrlDirector.buildArticleURL(this.apiCheckArticleId)
      this.#hasRestApi = await checkApiAvailability(checkUrl)
      logger.log('Checked for RestApi at', checkUrl, '-- result is: ', this.#hasRestApi)
    }
    return this.#hasRestApi
  }

  public async hasActionParseApi(): Promise<boolean> {
    if (this.#hasActionParseApi === null) {
      for (const skin of ['vector-2022', 'vector']) {
        this.actionParseUrlDirector = new ActionParseURLDirector(this.actionApiUrl.href, skin)
        const checkUrl = this.actionParseUrlDirector.buildArticleURL(this.apiCheckArticleId)
        this.#hasActionParseApi = await checkApiAvailability(checkUrl)
        logger.log(`Checked for ActionParseApi with skin ${skin} at ${checkUrl} -- result is: ${this.#hasActionParseApi}`)
        if (this.#hasActionParseApi) {
          this.skin = skin
          break
        }
      }
    }
    return this.#hasActionParseApi
  }

  public async hasCoordinates(): Promise<boolean> {
    if (this.#hasCoordinates === null) {
      const validNamespaceIds = this.namespacesToMirror.map((ns) => this.namespaces[ns].num)
      const reqOpts = {
        ...this.queryOpts,
        prop: this.queryOpts.prop + '|coordinates', // add coordinates for this call to get proper warning if not supported
        rdnamespace: validNamespaceIds,
      }

      const resp = await Downloader.getJSON<MwApiResponse>(this.#apiUrlDirector.buildQueryURL(reqOpts))
      const isCoordinateWarning = JSON.stringify(resp?.warnings?.query ?? '').includes('coordinates')
      if (isCoordinateWarning) {
        logger.log('Coordinates not available on this wiki')
        return (this.#hasCoordinates = false)
      }
      logger.log('Coordinates available on this wiki')
      return (this.#hasCoordinates = true)
    }
    return this.#hasCoordinates
  }

  public async hasModuleApi(): Promise<boolean> {
    if (this.#hasModuleApi === null) {
      // startup JS module is supposed to be available on all Mediawikis
      const checkUrl = `${this.modulePath}lang=en&modules=startup&only=scripts`
      this.#hasModuleApi = await checkApiAvailability(checkUrl)
      logger.log('Checked for Module API at', checkUrl, '-- result is: ', this.#hasRestApi)
    }
    return this.#hasModuleApi
  }

  private setWikimediaDesktopApiUrl() {
    this.wikimediaDesktopApiUrl = this.urlDirector.buildWikimediaDesktopApiUrl()
  }

  private setWikimediaMobileApiUrl() {
    this.wikimediaMobileApiUrl = this.urlDirector.buildWikimediaMobileApiUrl()
  }

  private setRestApiURL() {
    this.restApiUrl = this.urlDirector.buildRestApiUrl(this.#restApiPath)
  }

  private setVisualEditorURL() {
    this.#apiUrlDirector = new ApiURLDirector(this.actionApiUrl.href)
    this.visualEditorApiUrl = this.#apiUrlDirector.buildVisualEditorURL()
  }

  private setModuleURL() {
    this.modulePath = this.urlDirector.buildModuleURL(this.#modulePathOpt)
  }

  private setMobileModuleUrl() {
    this.mobileModulePath = this.urlDirector.buildMobileModuleURL()
  }

  public async login() {
    if (this.#username && this.#password) {
      let url = this.actionApiUrl.href + '?'

      // Add domain if configured
      if (this.#domain) {
        url = `${url}lgdomain=${this.#domain}&`
      }

      // Getting token to login.
      const { content } = await Downloader.downloadContent(url + 'action=query&meta=tokens&type=login&format=json&formatversion=2', 'data')

      // Logging in
      await Downloader.request({
        url: this.actionApiUrl.href,
        data: qs.stringify({
          action: 'login',
          format: 'json',
          lgname: this.#username,
          lgpassword: this.#password,
          lgtoken: JSON.parse(content.toString()).query.tokens.logintoken,
        }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
      }).then(async (resp) => {
        if (resp.data.login?.result !== 'Success') {
          const reason = resp.data.login?.reason
          if (reason) {
            logger.error(reason)
          }
          throw new Error('Login Failed')
        } else {
          logger.log('Login Success')
        }
      })
    }
  }

  public async getNamespaces(addNamespaces: number[]) {
    const url = this.#apiUrlDirector.buildNamespacesURL()

    const json: any = await Downloader.getJSON(url)
    ;['namespaces', 'namespacealiases'].forEach((type) => {
      const entries = json.query[type]
      Object.keys(entries).forEach((key) => {
        const entry = entries[key]
        const name = type === 'namespaces' ? entry.name : entry.alias
        const num = entry.id
        const allowedSubpages = 'subpages' in entry
        const isContent = type === 'namespaces' ? !!(entry.content || util.contains(addNamespaces, num)) : !!(entry.content !== undefined || util.contains(addNamespaces, num))
        const isBlacklisted = BLACKLISTED_NS.includes(name)
        const canonical = entry.canonical ? entry.canonical : ''
        const details = { num, allowedSubpages, isContent }

        /* Namespaces in local language */
        this.namespaces[util.lcFirst(name)] = details
        this.namespaces[util.ucFirst(name)] = details

        /* Namespaces in English (if available) */
        if (canonical) {
          this.namespaces[util.lcFirst(canonical)] = details
          this.namespaces[util.ucFirst(canonical)] = details
        }

        /* Is content to mirror */
        if (isContent && !isBlacklisted) {
          this.namespacesToMirror.push(name)
        }
      })
    })
  }

  public extractPageTitleFromHref(href: any) {
    try {
      const pathname = new URL(href, this.baseUrl).pathname

      // Link to index.php with query parameters like "/w/index.php?title=Blue_whale"
      if (href.startsWith(this.#indexPhpPath)) {
        const queryString = href.split('?')[1]
        const params = new URLSearchParams(queryString)
        return params.get('title')
      }

      // Local relative URL
      if (href.indexOf('./') === 0) {
        return util.decodeURIComponent(pathname.substr(1))
      }

      // Absolute path
      if (pathname.startsWith(this.webUrl.pathname)) {
        return util.decodeURIComponent(pathname.substr(this.webUrl.pathname.length))
      }

      const isPaginatedRegExp = /\/[0-9]+(\.|$)/
      const isPaginated = isPaginatedRegExp.test(href)
      if (isPaginated) {
        const withoutDotHtml = href.split('.').slice(0, -1).join('.')
        const lastTwoSlashes = withoutDotHtml.split('/').slice(-2).join('/')
        return lastTwoSlashes
      }
      if (pathParser.parse(href).dir.includes('../')) {
        return pathParser.parse(href).name
      }

      return null /* Interwiki link? -- return null */
    } catch {
      logger.warn(`Unable to parse href ${href}`)
      return null
    }
  }

  public getCreatorName() {
    /*
     * Find a suitable name to use for ZIM (content) creator
     * Heuristic: Use basename of the domain unless
     * - it happens to be a wikimedia project OR
     * - some domain where the second part of the hostname is longer than the first part
     */
    const hostParts = this.baseUrl.hostname.split('.')
    let creator = hostParts[0]
    if (hostParts.length > 1) {
      const wmProjects = new Set(['wikipedia', 'wikisource', 'wikibooks', 'wikiquote', 'wikivoyage', 'wikiversity', 'wikinews', 'wiktionary'])

      if (wmProjects.has(hostParts[1]) || hostParts[0].length < hostParts[1].length) {
        creator = hostParts[1] // Name of the wikimedia project
      }
    }
    creator = creator.charAt(0).toUpperCase() + creator.substr(1)
    return creator
  }

  public async getSiteInfo() {
    logger.log('Getting site info...')
    const body = await Downloader.querySiteInfo()

    const entries = body.query.general
    const { url: licenseUrl, text: licenseName } = body.query.rightsinfo

    // Checking mediawiki version
    const mwVersion = semver.coerce(entries.generator).raw
    const mwMinimalVersion = 1.27
    if (!entries.generator || !semver.satisfies(mwVersion, `>=${mwMinimalVersion}`)) {
      throw new Error(`Mediawiki version ${mwVersion} not supported should be >=${mwMinimalVersion}`)
    }

    const mainPage = entries.mainpage.replace(/ /g, '_')
    const siteName = entries.sitename
    const logo = entries.logo
    const langMw = entries.lang
    const textDir = entries.rtl ? 'rtl' : 'ltr'
    logger.log(`Text direction is [${textDir}]`)

    // Gather languages codes (en remove the 'dialect' part)
    const langs: string[] = [langMw].concat(entries.fallback.map((e: any) => e.code)).map(function (e) {
      return e.replace(/-.*/, '')
    })

    const [langIso2, langIso3] = await Promise.all(
      langs.map(async (lang: string) => {
        let langIso3
        try {
          langIso3 = await util.getIso3(lang)
        } catch {
          langIso3 = lang
        }
        try {
          return [lang, langIso3]
        } catch {
          return false
        }
      }),
    ).then((possibleLangPairs) => {
      possibleLangPairs = possibleLangPairs.filter((a) => a)
      return possibleLangPairs[0] || ['en', 'eng']
    })

    return {
      mainPage,
      siteName,
      textDir,
      langMw,
      langIso2,
      langIso3,
      logo,
      licenseName,
      licenseUrl,
    }
  }

  public async getSubTitle() {
    logger.log('Getting sub-title...')
    const { content } = await Downloader.downloadContent(this.webUrl.href, 'data')
    const html = content.toString()
    const doc = domino.createDocument(html)
    const subTitleNode = doc.getElementById('siteSub')
    return subTitleNode ? subTitleNode.innerHTML : ''
  }

  public async getMwMetaData(): Promise<MWMetaData> {
    if (this.metaData) {
      return this.metaData
    }

    const creator = this.getCreatorName() || 'Kiwix'

    const [{ langIso2, langIso3, mainPage, siteName, logo, langMw, textDir, licenseName, licenseUrl }, subTitle] = await Promise.all([this.getSiteInfo(), this.getSubTitle()])

    const mwMetaData: MWMetaData = {
      webUrl: this.webUrl.href,
      actionApiUrl: this.actionApiUrl.href,
      restApiUrl: this.restApiUrl.href,
      modulePathOpt: this.#modulePathOpt,
      modulePath: this.modulePath,
      mobileModulePath: this.mobileModulePath,
      webUrlPath: this.webUrl.pathname,
      wikiPath: this.#wikiPath,
      indexPhpPath: this.#indexPhpPath,
      baseUrl: this.baseUrl.href,
      actionApiPath: this.#actionApiPath,
      restApiPath: this.#restApiPath,
      domain: this.#domain,

      textDir: textDir as TextDirection,
      langMw,
      langIso2,
      langIso3,
      title: siteName,
      subTitle,
      creator,
      mainPage,
      logo,
      licenseName,
      licenseUrl,
    }

    this.metaData = mwMetaData

    return mwMetaData
  }

  public reset(): void {
    this.initializeMediaWikiDefaults()
  }
}

const mw = MediaWiki.getInstance()
export default mw as MediaWiki
