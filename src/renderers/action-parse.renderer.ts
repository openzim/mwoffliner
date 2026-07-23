import domino from 'domino'
import { DownloadOpts, DownloadRes, Renderer, RenderOptsModules } from './abstract.renderer.js'
import { RenderOpts } from './abstract.renderer.js'
import * as logger from '../Logger.js'
import { config } from '../config.js'
import { genCanonicalLink, genHeaderScript, genHeaderCSSLink, getRelativeFilePath, jsonStringify, replaceSafe } from '../util/misc.js'
import MediaWiki from '../MediaWiki.js'
import { htmlVectorLegacyTemplateCode, htmlVector2022TemplateCode, htmlFallbackTemplateCode, javaScriptTemplateCode } from '../Templates.js'
import Downloader, { DownloadError } from '../Downloader.js'
import { customCssUrlToFilename, customJsUrlToFilename } from '../util/customCssJs.js'
import Gadgets from '../Gadgets.js'
import { extractJsConfigVars, extractBodyCssClass, extractHtmlCssClass, getMainpageTitle } from '../util/pages.js'

// Represent 'https://{wikimedia-wiki}/w/api.php?action=parse&format=json&prop=modules|jsconfigvars|headhtml|text|displaytitle|subtitle|categorieshtml&usearticle=1&disableeditsection=1&disablelimitreport=1&page={page_title}&useskin=vector-2022&redirects=1&formatversion=2'
export interface ActionParseResult {
  parse: {
    title: string
    pageid: number
    redirects?: {
      from: string
      to: string
      fragment?: string
    }[]
    text: string
    displaytitle: string
    subtitle: string
    categorieshtml: string
    headhtml: string
    modules: string[]
    modulestyles: string[]
    jsconfigvars: KVS<any>
  }
}

export class ActionParseRenderer extends Renderer {
  #staticFilesList: Set<string> = new Set()
  #htmlTemplateCode: () => string
  constructor() {
    super()
    if (this.#staticFilesList.size === 0) {
      this.#staticFilesList.add('external-link.svg')
      if (['vector', 'vector-2022'].includes(MediaWiki.skin)) {
        this.#staticFilesList.add(`${MediaWiki.skin}.css`)
      }
    }
    this.#htmlTemplateCode = MediaWiki.skin === 'vector' ? htmlVectorLegacyTemplateCode : MediaWiki.skin === 'vector-2022' ? htmlVector2022TemplateCode : htmlFallbackTemplateCode
    if (this.#htmlTemplateCode === htmlFallbackTemplateCode) {
      logger.warn(`Unsupported skin ${MediaWiki.skin}, using fallback template to display pages.`)
    }
  }

  public templatePage(bodyCssClass: string, htmlCssClass: string, hideFirstHeading: boolean, moduleDependencies: RenderOptsModules, pagePath: ZimPath): Document {
    const { jsConfigVars, jsDependenciesList, styleDependenciesList } = moduleDependencies

    const pageLangDir = `lang="${MediaWiki.metaData?.langMw || 'en'}" dir="${MediaWiki.metaData?.textDir || 'ltr'}"`
    jsConfigVars.zimRelativeFilePath = getRelativeFilePath(pagePath, '')
    const pageJsStartup = Downloader.trustedJs ? genHeaderScript(config, 'startup', pagePath, config.output.dirs.mediawiki, 'async') : ''
    const pageCssState = { 'user.options': 'loading' }
    for (const oneCssDep of styleDependenciesList) {
      pageCssState[oneCssDep] = 'ready'
    }
    const pageCssBeforeMeta = styleDependenciesList
      .filter((oneCssDep: string) => {
        return !oneCssDep.startsWith('ext.gadget') && !['site.styles', 'noscript'].includes(oneCssDep)
      })
      .sort()
      .map((oneCssDep: string) => genHeaderCSSLink(config, oneCssDep, pagePath, config.output.dirs.mediawiki))
      .join('\n    ')
    const pageCssAfterMeta = styleDependenciesList
      .filter((oneCssDep: string) => {
        return oneCssDep.startsWith('ext.gadget')
      })
      .sort()
      .map((oneCssDep: string) => genHeaderCSSLink(config, oneCssDep, pagePath, config.output.dirs.mediawiki))
      .join('\n    ')
    let pageCssNoscript = genHeaderCSSLink(config, 'noscript', pagePath, config.output.dirs.mediawiki)
    if (Downloader.trustedJs) {
      pageCssNoscript = `<noscript>${pageCssNoscript}</noscript>`
    }

    const javaScriptTemplateString = (Downloader.trustedJs ? javaScriptTemplateCode() : '')
      .replace('__PAGE_CONFIGVARS__', jsonStringify(jsConfigVars))
      .replace('__PAGE_JS_MODULES__', jsonStringify(jsDependenciesList))
      .replace('__PAGE_CSS_STATE__', jsonStringify(pageCssState))

    // Generate custom CSS links from --customCss option
    const customCssLinks = (Downloader.customCssUrls || [])
      .map((cssUrl: string) => {
        const filename = customCssUrlToFilename(cssUrl)
        return genHeaderCSSLink(config, filename, pagePath, config.output.dirs.res)
      })
      .join('\n    ')

    // Generate custom JS links from --customJs option
    const customJsLinks = (Downloader.customJsUrls || [])
      .map((jsUrl: string) => {
        const filename = customJsUrlToFilename(jsUrl)
        return genHeaderScript(config, filename, pagePath, config.output.dirs.res)
      })
      .join('\n    ')

    // Generate MathJax script tags for pages that need it
    const mathJaxScripts =
      moduleDependencies.needsMathJax && Downloader.mathJaxSource
        ? [
            ...(Downloader.mathJaxConfigScript ? [Downloader.mathJaxConfigScript] : []),
            `<script src="__RELATIVE_FILE_PATH__${config.output.dirs.mathjax}/${Downloader.mathJaxEntryPoint}"></script>`,
          ].join('\n    ')
        : ''

    const htmlTemplateString = replaceSafe(this.#htmlTemplateCode())
      .replace(/__PAGE_LANG_DIR__/g, pageLangDir)
      .replace('__PAGE_CANONICAL_LINK__', genCanonicalLink(config, MediaWiki.webUrl.href, pagePath))
      .replace('__PAGE_JAVASCRIPT__', javaScriptTemplateString)
      .replace('__PAGE_CSS_BEFORE_META__', pageCssBeforeMeta)
      .replace('__PAGE_JS_STARTUP__', pageJsStartup)
      .replace('__PAGE_CSS_AFTER_META__', pageCssAfterMeta)
      .replace('__PAGE_CSS_NOSCRIPT__', pageCssNoscript)
      .replace('__CUSTOM_CSS__', customCssLinks)
      .replace('__CUSTOM_JS__', customJsLinks)
      .replace('__MATHJAX_SCRIPTS__', mathJaxScripts)
      .replace(/__ASSETS_DIR__/g, config.output.dirs.assets)
      .replace(/__RES_DIR__/g, config.output.dirs.res)
      .replace(/__MW_DIR__/g, config.output.dirs.mediawiki)
      .replace(/__MATHJAX_ROOT__/g, getRelativeFilePath(pagePath, config.output.dirs.mathjax))
      .replace(/__RELATIVE_FILE_PATH__/g, getRelativeFilePath(pagePath, ''))
      .replace('__PAGE_BODY_CSS_CLASS__', bodyCssClass)
      .replace('__PAGE_HTML_CSS_CLASS__', htmlCssClass)
      .replace('__PAGE_FIRST_HEADING_STYLE__', hideFirstHeading ? 'style="display: none;"' : '')
      .toString()

    return domino.createDocument(htmlTemplateString)
  }

  public async download(downloadOpts: DownloadOpts): Promise<DownloadRes> {
    const { pageTitle, pageUrl, langVar } = downloadOpts

    let data: ActionParseResult
    try {
      data = await Downloader.getJSON<ActionParseResult>(pageUrl)
    } catch (err) {
      if (err instanceof DownloadError && err.responseData.error?.code === 'missingtitle') {
        // For missing pages, query log events searching for a recent move, and if found check
        // if it has been done without redirect left behind. If so, download content from the new
        // page location
        const logEvents = await Downloader.getLogEvents('move', pageTitle)
        if (!logEvents || !logEvents[0]) {
          throw err
        }
        const logEvent = logEvents[0]
        if (!logEvent.params?.target_title) {
          throw err
        }
        if (!Object.keys(logEvent.params).includes('suppressredirect')) {
          throw err
        }
        data = await Downloader.getJSON<any>(Downloader.getPageUrl(logEvent.params.target_title, { langVar }))
      } else if (err instanceof DownloadError && err.responseData.error?.code === 'nosuchsection') {
        // For pages without the specified section, get the whole page instead
        logger.warn(`Can't get a specific section of page "${pageTitle}", getting the complete page instead.`)
        data = await Downloader.getJSON<any>(Downloader.getPageUrl(pageTitle, { langVar }))
      } else {
        throw err
      }
    }

    if (!data.parse) {
      throw new DownloadError('ActionParse response is empty', pageUrl, null, null, data)
    }

    // Remove user specific module dependencies
    const styleDependenciesList = data.parse.modulestyles.filter((oneCssDep: string) => {
      return !oneCssDep.startsWith('user')
    })
    const jsDependenciesList = data.parse.modules.filter((oneJsDep: string) => {
      return !oneJsDep.startsWith('user')
    })

    // Preload jquery.tablesorter for mediawiki.page.ready
    if (data.parse.text.includes('sortable')) {
      styleDependenciesList.push('jquery.tablesorter.styles')
      jsDependenciesList.push('jquery.tablesorter')
    }
    // Preload jquery.makeCollapsible for mediawiki.page.ready
    if (data.parse.text.includes('mw-collapsible')) {
      styleDependenciesList.push('jquery.makeCollapsible.styles')
      jsDependenciesList.push('jquery.makeCollapsible')
    }

    const needsMathJax = Downloader.mathJaxAllPages || data.parse.modules.some((mod: string) => /mathjax/i.test(mod))

    const moduleDependencies = {
      // Do not add JS-related stuff for now with ActionParse, see #2310
      jsConfigVars: extractJsConfigVars(data.parse.headhtml, data.parse.jsconfigvars),
      jsDependenciesList: config.output.mw.js.concat(jsDependenciesList),
      styleDependenciesList: config.output.mw.css.concat(styleDependenciesList),
      needsMathJax,
    }

    const bodyCssClass = extractBodyCssClass(data.parse.headhtml)
    const htmlCssClass = extractHtmlCssClass(data.parse.headhtml)

    return {
      data: data.parse.text,
      moduleDependencies,
      redirects: data.parse.redirects.map((redirect) => {
        return { from: redirect.from as PageTitle, to: redirect.to as PageTitle, fragment: redirect.fragment }
      }),
      displayTitle: data.parse.displaytitle,
      subtitle: data.parse.subtitle,
      categoriesHtml: data.parse.categorieshtml,
      bodyCssClass,
      htmlCssClass,
    }
  }

  public async render(renderOpts: RenderOpts): Promise<RenderOutput> {
    const { data, pageTitle, pageDetail, subtitle: pageSubtitle, moduleDependencies, categoryMembers, categoriesHtml, bodyCssClass, htmlCssClass, dump } = renderOpts
    let { displayTitle } = renderOpts

    if (!data) {
      throw new Error('Cannot render missing data into a page')
    }

    const htmlDocument = domino.createDocument(data)

    // Remove edit links + brackets
    const editLinks = htmlDocument.querySelectorAll('.mw-editsection')
    editLinks.forEach((elem: DominoElement) => {
      elem.remove()
    })

    // Main page display title
    let hideFirstHeading = false
    if (bodyCssClass.split(' ').includes('page-Main_Page')) {
      // Check for class to avoid custom main pages
      const mainpageTitle = await getMainpageTitle()
      if (mainpageTitle === '') {
        hideFirstHeading = true
      } else if (mainpageTitle !== '-') {
        displayTitle = mainpageTitle
      }
    }

    // Add gadgets which are used on this page
    const { cssGadgets, jsGadgets } = Gadgets.getActiveGadgetsByType(pageDetail)
    cssGadgets.sort().map((gadgetId) => {
      moduleDependencies.styleDependenciesList.push(`ext.gadget.${gadgetId}`)
    })
    jsGadgets.map((gadgetId) => {
      moduleDependencies.jsDependenciesList.push(`ext.gadget.${gadgetId}`)
    })

    if (!Downloader.trustedJs) {
      moduleDependencies.jsDependenciesList = []
    } else if (Downloader.trustedJs.length) {
      moduleDependencies.jsDependenciesList = moduleDependencies.jsDependenciesList.filter((oneJsDep) => {
        return Downloader.trustedJs.includes(oneJsDep)
      })
    }

    return super.processHtml({
      html: htmlDocument.documentElement.outerHTML,
      dump,
      pageTitle,
      pageDetail,
      displayTitle,
      pageSubtitle,
      categoryMembers,
      categoriesHtml,
      moduleDependencies,
      callback: this.templatePage.bind(this, bodyCssClass, htmlCssClass, hideFirstHeading),
    })
  }

  public getStaticFilesList(): Set<string> {
    return new Set([...this.#staticFilesList, ...this.staticFilesListCommon])
  }
}
