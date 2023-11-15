import * as pathParser from 'path'
import * as logger from './Logger.js'
import * as util from './util/index.js'
import * as domino from 'domino'
import type Downloader from './Downloader.js'
import axios from 'axios'
import qs from 'querystring'
import semver from 'semver'
import basicURLDirector from './util/builders/url/basic.director.js'
import BaseURLDirector from './util/builders/url/base.director.js'
import ApiURLDirector from './util/builders/url/api.director.js'
import WikimediaDesktopURLDirector from './util/builders/url/desktop.director.js'
import WikimediaMobileURLDirector from './util/builders/url/mobile.director.js'
import VisualEditorURLDirector from './util/builders/url/visual-editor.director.js'
import MediawikiRestApiURLDirector from './util/builders/url/mediawiki-rest-api.director.js'
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

  #wikiPath: string
  #actionApiPath: string
  #restApiPath: string
  #modulePathOpt: string
  #mediawikiRestApiPath: string
  #username: string
  #password: string
  #domain: string

  public wikimediaDesktopUrlDirector: WikimediaDesktopURLDirector
  public wikimediaMobileUrlDirector: WikimediaMobileURLDirector
  public visualEditorUrlDirector: VisualEditorURLDirector
  public mediawikiRestApiUrlDirector: MediawikiRestApiURLDirector

  public visualEditorApiUrl: URL
  public actionApiUrl: URL
  public mediawikiRestApiUrl: URL
  public webUrl: URL
  public wikimediaDesktopApiUrl: URL
  public wikimediaMobileApiUrl: URL

  public modulePath: string // only for reading
  public mobileModulePath: string

  #apiUrlDirector: ApiURLDirector
  #hasWikimediaDesktopApi: boolean | null
  #hasWikimediaMobileApi: boolean | null
  #hasVisualEditorApi: boolean | null
  #hasMediawikiRestApi: boolean | null
  #hasCoordinates: boolean | null

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
      this.setWikimediaDesktopApiUrl()
      this.setWikimediaMobileApiUrl()
    }
  }

  set mediawikiRestApiPath(value: string) {
    if (value) {
      this.#mediawikiRestApiPath = value
      this.setMediawikiRestApiURL()
    }
  }

  set domain(value: string) {
    this.#domain = value
  }

  set wikiPath(value: string) {
    if (value) {
      this.#wikiPath = value
      this.webUrl = this.urlDirector.buildURL(this.#wikiPath)
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
      this.setMediawikiRestApiURL()
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

    this.#actionApiPath = 'w/api.php'
    this.#restApiPath = 'api/rest_v1'
    this.#mediawikiRestApiPath = 'w/rest.php/v1/page/'
    this.#wikiPath = 'wiki/'
    this.#modulePathOpt = 'w/load.php'

    this.namespaces = {}
    this.namespacesToMirror = []
    this.apiCheckArticleId = 'MediaWiki:Sidebar'

    this.queryOpts = {
      action: 'query',
      format: 'json',
      prop: 'redirects|revisions',
      rdlimit: 'max',
      rdnamespace: 0,
      redirects: false,
      formatversion: '2',
    }

    this.#hasWikimediaDesktopApi = null
    this.#hasWikimediaMobileApi = null
    this.#hasVisualEditorApi = null
    this.#hasMediawikiRestApi = null
    this.#hasCoordinates = null
  }

  private constructor() {
    this.initializeMediaWikiDefaults()
  }

  public async hasWikimediaDesktopApi(): Promise<boolean> {
    if (this.#hasWikimediaDesktopApi === null) {
      this.wikimediaDesktopUrlDirector = new WikimediaDesktopURLDirector(this.wikimediaDesktopApiUrl.href)
      this.#hasWikimediaDesktopApi = await checkApiAvailability(this.wikimediaDesktopUrlDirector.buildArticleURL(this.apiCheckArticleId))
      return this.#hasWikimediaDesktopApi
    }
    return this.#hasWikimediaDesktopApi
  }

  public async hasWikimediaMobileApi(): Promise<boolean> {
    if (this.#hasWikimediaMobileApi === null) {
      this.wikimediaMobileUrlDirector = new WikimediaMobileURLDirector(this.wikimediaMobileApiUrl.href)
      this.#hasWikimediaMobileApi = await checkApiAvailability(this.wikimediaMobileUrlDirector.buildArticleURL(this.apiCheckArticleId))
      return this.#hasWikimediaMobileApi
    }
    return this.#hasWikimediaMobileApi
  }

  public async hasVisualEditorApi(): Promise<boolean> {
    if (this.#hasVisualEditorApi === null) {
      this.visualEditorUrlDirector = new VisualEditorURLDirector(this.visualEditorApiUrl.href)
      this.#hasVisualEditorApi = await checkApiAvailability(this.visualEditorUrlDirector.buildArticleURL(this.apiCheckArticleId))
      return this.#hasVisualEditorApi
    }
    return this.#hasVisualEditorApi
  }

  public async hasMediawikiRestApi(): Promise<boolean> {
    if (this.#hasMediawikiRestApi === null) {
      this.mediawikiRestApiUrlDirector = new MediawikiRestApiURLDirector(this.mediawikiRestApiUrl.href)
      this.#hasMediawikiRestApi = await checkApiAvailability(this.mediawikiRestApiUrlDirector.buildArticleURL(this.apiCheckArticleId))
      return this.#hasMediawikiRestApi
    }
    return this.#hasMediawikiRestApi
  }

  public async hasCoordinates(downloader: Downloader): Promise<boolean> {
    if (this.#hasCoordinates === null) {
      const validNamespaceIds = this.namespacesToMirror.map((ns) => this.namespaces[ns].num)
      const reqOpts = {
        ...this.queryOpts,
        rdnamespace: validNamespaceIds,
      }

      const resp = await downloader.getJSON<MwApiResponse>(this.#apiUrlDirector.buildQueryURL(reqOpts))
      const isCoordinateWarning = JSON.stringify(resp?.warnings?.query ?? '').includes('coordinates')
      if (isCoordinateWarning) {
        logger.info('Coordinates not available on this wiki')
        return (this.#hasCoordinates = false)
      }
      return (this.#hasCoordinates = true)
    }
    return this.#hasCoordinates
  }

  private setWikimediaDesktopApiUrl() {
    this.wikimediaDesktopApiUrl = this.urlDirector.buildWikimediaDesktopApiUrl(this.#restApiPath)
  }

  private setWikimediaMobileApiUrl() {
    this.wikimediaMobileApiUrl = this.urlDirector.buildWikimediaMobileApiUrl(this.#restApiPath)
  }

  private setMediawikiRestApiURL() {
    this.mediawikiRestApiUrl = this.urlDirector.buildMediawikiRestApiUrl(this.#mediawikiRestApiPath)
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

  public async login(downloader: Downloader) {
    if (this.#username && this.#password) {
      let url = this.actionApiUrl.href + '?'

      // Add domain if configured
      if (this.#domain) {
        url = `${url}lgdomain=${this.#domain}&`
      }

      // Getting token to login.
      const { content, responseHeaders } = await downloader.downloadContent(url + 'action=query&meta=tokens&type=login&format=json&formatversion=2')

      // Logging in
      await axios(this.actionApiUrl.href, {
        data: qs.stringify({
          action: 'login',
          format: 'json',
          lgname: this.#username,
          lgpassword: this.#password,
          lgtoken: JSON.parse(content.toString()).query.tokens.logintoken,
        }),
        headers: {
          Cookie: responseHeaders['set-cookie'].join(';'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
      })
        .then(async (resp) => {
          if (resp.data.login.result !== 'Success') {
            throw new Error('Login Failed')
          }

          downloader.loginCookie = resp.headers['set-cookie'].join(';')
        })
        .catch((err) => {
          throw err
        })
    }
  }

  public async getNamespaces(addNamespaces: number[], downloader: Downloader) {
    const url = this.#apiUrlDirector.buildNamespacesURL()

    const json: any = await downloader.getJSON(url)
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

      // Local relative URL
      if (href.indexOf('./') === 0) {
        return util.decodeURIComponent(pathname.substr(1))
      }

      // Absolute path
      if (pathname.indexOf(this.webUrl.pathname) === 0) {
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
    } catch (error) {
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

  public async getTextDirection(downloader: Downloader): Promise<TextDirection> {
    logger.log('Getting text direction...')
    const { content } = await downloader.downloadContent(this.webUrl.href)
    const body = content.toString()
    const doc = domino.createDocument(body)
    const contentNode = doc.getElementById('mw-content-text')
    const languageDirectionRegex = /"pageLanguageDir":"(.*?)"/
    const parts = languageDirectionRegex.exec(body)
    let isLtr = true
    if (parts && parts[1]) {
      isLtr = parts[1] === 'ltr'
    } else if (contentNode) {
      isLtr = contentNode.getAttribute('dir') === 'ltr'
    } else {
      logger.log('Unable to get the language direction, fallback to ltr')
      isLtr = true
    }
    const textDir = isLtr ? 'ltr' : 'rtl'
    logger.log(`Text direction is [${textDir}]`)
    return textDir
  }

  public async getSiteInfo(downloader: Downloader) {
    logger.log('Getting site info...')
    const body = await downloader.query()

    const entries = body.query.general

    // Checking mediawiki version
    const mwVersion = semver.coerce(entries.generator).raw
    const mwMinimalVersion = 1.27
    if (!entries.generator || !semver.satisfies(mwVersion, `>=${mwMinimalVersion}`)) {
      throw new Error(`Mediawiki version ${mwVersion} not supported should be >=${mwMinimalVersion}`)
    }

    // Base will contain the default encoded article id for the wiki.
    const mainPage = decodeURIComponent(entries.base.split('/').pop())
    const siteName = entries.sitename

    // Gather languages codes (en remove the 'dialect' part)
    const langs: string[] = [entries.lang].concat(entries.fallback.map((e: any) => e.code)).map(function (e) {
      return e.replace(/\-.*/, '')
    })

    const [langIso2, langIso3] = await Promise.all(
      langs.map(async (lang: string) => {
        let langIso3
        try {
          langIso3 = await util.getIso3(lang)
        } catch (err) {
          langIso3 = lang
        }
        try {
          return [lang, langIso3]
        } catch (err) {
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
      langIso2,
      langIso3,
    }
  }

  public async getSubTitle(downloader: Downloader) {
    logger.log('Getting sub-title...')
    const { content } = await downloader.downloadContent(this.webUrl.href)
    const html = content.toString()
    const doc = domino.createDocument(html)
    const subTitleNode = doc.getElementById('siteSub')
    return subTitleNode ? subTitleNode.innerHTML : ''
  }

  public async getMwMetaData(downloader: Downloader): Promise<MWMetaData> {
    if (this.metaData) {
      return this.metaData
    }

    const creator = this.getCreatorName() || 'Kiwix'

    const [textDir, { langIso2, langIso3, mainPage, siteName }, subTitle] = await Promise.all([
      this.getTextDirection(downloader),
      this.getSiteInfo(downloader),
      this.getSubTitle(downloader),
    ])

    const mwMetaData: MWMetaData = {
      webUrl: this.webUrl.href,
      actionApiUrl: this.actionApiUrl.href,
      mediawikiRestApiUrl: this.mediawikiRestApiUrl.href,
      modulePathOpt: this.#modulePathOpt,
      modulePath: this.modulePath,
      mobileModulePath: this.mobileModulePath,
      webUrlPath: this.webUrl.pathname,
      wikiPath: this.#wikiPath,
      baseUrl: this.baseUrl.href,
      actionApiPath: this.#actionApiPath,
      mediawikiRestApiPath: this.#mediawikiRestApiPath,
      restApiPath: this.#restApiPath,
      domain: this.#domain,

      textDir: textDir as TextDirection,
      langIso2,
      langIso3,
      title: siteName,
      subTitle,
      creator,
      mainPage,
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
