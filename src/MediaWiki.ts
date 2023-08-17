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
import DesktopURLDirector from './util/builders/url/desktop.director.js'
import VisualEditorURLDirector from './util/builders/url/visual-editor.director.js'
import { checkApiAvailability } from './util/mw-api.js'

class MediaWiki {
  private static instance: MediaWiki

  public static getInstance(): MediaWiki {
    if (!MediaWiki.instance) {
      MediaWiki.instance = new MediaWiki()
    }
    return MediaWiki.instance
  }

  public metaData: MWMetaData
  public _base: string
  public baseUrl: URL
  public getCategories: boolean
  public readonly namespaces: MWNamespaces = {}
  public readonly namespacesToMirror: string[] = []
  public mwArticleId = 'MediaWiki:Sidebar'

  #wikiPath: string
  #restApiPath: string
  #username: string
  #password: string
  #apiPath: string
  #domain: string
  private apiUrlDirector: ApiURLDirector
  private wikimediaDesktopUrlDirector: DesktopURLDirector
  private visualEditorURLDirector: VisualEditorURLDirector

  public visualEditorApiUrl: URL
  public apiUrl: URL
  public modulePath: string // only for reading
  public _modulePathOpt: string // only for whiting to generate modulePath
  public webUrl: URL
  public desktopRestApiUrl: URL

  #hasWikimediaDesktopRestApi = false
  #hasVisualEditorApi = false

  set username(value: string) {
    this.#username = value
  }

  set password(value: string) {
    this.#password = value
  }

  set apiPath(value: string) {
    this.#apiPath = value
  }

  set restApiPath(value: string) {
    this.#restApiPath = value
  }

  set domain(value: string) {
    this.#domain = value
  }

  set wikiPath(value: string) {
    this.#wikiPath = value
  }

  set base(value: string) {
    this.baseUrl = basicURLDirector.buildMediawikiBaseURL(value)
    this.initMWApis()
  }

  set modulePathOpt(value: string) {
    this._modulePathOpt = value
  }

  private constructor() {
    this.#domain = ''
    this.#username = ''
    this.#password = ''
    this.getCategories = false

    this.#apiPath = 'w/api.php'
    this.#wikiPath = 'wiki/'
  }

  public async hasWikimediaDesktopRestApi(): Promise<boolean> {
    if (!this.#hasWikimediaDesktopRestApi) {
      this.#hasWikimediaDesktopRestApi = await checkApiAvailability(this.wikimediaDesktopUrlDirector.buildArticleURL(this.mwArticleId))
      return this.#hasWikimediaDesktopRestApi
    }
    return this.#hasWikimediaDesktopRestApi
  }

  public async hasVisualEditorApi(): Promise<boolean> {
    if (!this.#hasVisualEditorApi) {
      this.#hasVisualEditorApi = await checkApiAvailability(this.visualEditorURLDirector.buildArticleURL(this.mwArticleId))
      return this.#hasVisualEditorApi
    }
    return this.#hasVisualEditorApi
  }

  private initMWApis() {
    const baseUrlDirector = new BaseURLDirector(this.baseUrl.href)
    this.webUrl = baseUrlDirector.buildURL(this.#wikiPath)
    this.apiUrl = baseUrlDirector.buildURL(this.#apiPath)
    this.apiUrlDirector = new ApiURLDirector(this.apiUrl.href)
    this.visualEditorApiUrl = this.apiUrlDirector.buildVisualEditorURL()
    this.desktopRestApiUrl = baseUrlDirector.buildDesktopRestApiURL(this.#restApiPath)
    this.modulePath = baseUrlDirector.buildModuleURL(this._modulePathOpt)
    this.wikimediaDesktopUrlDirector = new DesktopURLDirector(this.desktopRestApiUrl.href)
    this.visualEditorURLDirector = new VisualEditorURLDirector(this.visualEditorApiUrl.href)
  }

  public async login(downloader: Downloader) {
    if (this.#username && this.#password) {
      let url = this.apiUrl.href + '?'

      // Add domain if configured
      if (this.#domain) {
        url = `${url}lgdomain=${this.#domain}&`
      }

      // Getting token to login.
      const { content, responseHeaders } = await downloader.downloadContent(url + 'action=query&meta=tokens&type=login&format=json')

      // Logging in
      await axios(this.apiUrl.href, {
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
    const url = this.apiUrlDirector.buildNamespacesURL()

    const json: any = await downloader.getJSON(url)
    ;['namespaces', 'namespacealiases'].forEach((type) => {
      const entries = json.query[type]
      Object.keys(entries).forEach((key) => {
        const entry = entries[key]
        const name = entry['*']
        const num = entry.id
        const allowedSubpages = 'subpages' in entry
        const isContent = !!(entry.content !== undefined || util.contains(addNamespaces, num))
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
        if (isContent) {
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
      apiUrl: this.apiUrl.href,
      modulePath: this.modulePath,
      webUrlPath: this.webUrl.pathname,
      wikiPath: this.#wikiPath,
      baseUrl: this.baseUrl.href,
      apiPath: this.#apiPath,
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
}

const mw = MediaWiki.getInstance()
export default mw as MediaWiki
