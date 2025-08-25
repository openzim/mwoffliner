import domino from 'domino'
import { DownloadOpts, DownloadRes, Renderer, RenderOptsModules } from './abstract.renderer.js'
import { RenderOpts, RenderOutput } from './abstract.renderer.js'
import * as logger from '../Logger.js'
import { config } from '../config.js'
import { genCanonicalLink, genHeaderScript, genHeaderCSSLink, getStaticFiles, getRelativeFilePath } from '../util/misc.js'
import MediaWiki from '../MediaWiki.js'
import { htmlVectorLegacyTemplateCode, htmlVector2022TemplateCode, htmlFallbackTemplateCode } from '../Templates.js'
import Downloader, { DownloadError } from '../Downloader.js'
import Gadgets from '../Gadgets.js'
import { extractBodyCssClass, extractHtmlCssClass, getMainpageTitle } from '../util/articles.js'

// Represent 'https://{wikimedia-wiki}/w/api.php?action=parse&format=json&prop=modules|jsconfigvars|text|displaytitle|subtitle&usearticle=1&disableeditsection=1&disablelimitreport=1&page={article_title}&skin=vector-2022&formatversion=2'
export class ActionParseRenderer extends Renderer {
  public staticFilesList: string[] = []
  #htmlTemplateCode: () => string
  constructor() {
    super()
    if (this.staticFilesList.length === 0) {
      let cssResourcesCommon = config.output.cssResourcesCommon
      if (['vector', 'vector-2022'].includes(MediaWiki.skin)) {
        cssResourcesCommon = cssResourcesCommon.concat(MediaWiki.skin)
      }
      this.staticFilesList = getStaticFiles(config.output.jsResourcesCommon, cssResourcesCommon).concat('external-link.svg')
    }
    this.#htmlTemplateCode = MediaWiki.skin === 'vector' ? htmlVectorLegacyTemplateCode : MediaWiki.skin === 'vector-2022' ? htmlVector2022TemplateCode : htmlFallbackTemplateCode
    if (this.#htmlTemplateCode === htmlFallbackTemplateCode) {
      logger.warn(`Unsupported skin ${MediaWiki.skin}, using fallback template to display pages.`)
    }
  }

  public templateDesktopArticle(bodyCssClass: string, htmlCssClass: string, hideFirstHeading: boolean, moduleDependencies: RenderOptsModules, articleId: string): Document {
    const { jsConfigVars, jsDependenciesList, styleDependenciesList } = moduleDependencies

    const articleLangDir = `lang="${MediaWiki.metaData?.langMw || 'en'}" dir="${MediaWiki.metaData?.textDir || 'ltr'}"`
    const articleConfigVarsList = jsConfigVars === '' ? '' : genHeaderScript(config, 'jsConfigVars', articleId, config.output.dirs.mediawiki)
    const articleJsScripts = jsDependenciesList.map((oneJsDep: string) => genHeaderScript(config, oneJsDep, articleId, config.output.dirs.mediawiki))
    if (Downloader.webp) {
      articleJsScripts.push(...['webpHandler'].map((oneJsDep: string) => genHeaderScript(config, oneJsDep, articleId, config.output.dirs.webp)))
    }
    const articleCssBeforeMeta = styleDependenciesList
      .filter((oneCssDep: string) => {
        return !oneCssDep.startsWith('ext.gadget') && !['site.styles', 'noscript'].includes(oneCssDep)
      })
      .sort()
      .map((oneCssDep: string) => genHeaderCSSLink(config, oneCssDep, articleId, config.output.dirs.mediawiki))
      .join('\n    ')
    const articleCssAfterMeta = styleDependenciesList
      .filter((oneCssDep: string) => {
        return oneCssDep.startsWith('ext.gadget')
      })
      .sort()
      .map((oneCssDep: string) => genHeaderCSSLink(config, oneCssDep, articleId, config.output.dirs.mediawiki))
      .join('\n    ')

    const htmlTemplateString = this.#htmlTemplateCode()
      .replace(/__ARTICLE_LANG_DIR__/g, articleLangDir)
      .replace('__ARTICLE_CANONICAL_LINK__', genCanonicalLink(config, MediaWiki.webUrl.href, articleId))
      .replace('__ARTICLE_CONFIGVARS_LIST__', articleConfigVarsList)
      .replace('__ARTICLE_JS_LIST__', articleJsScripts.join('\n'))
      .replace('__ARTICLE_CSS_BEFORE_META__', articleCssBeforeMeta)
      .replace('__ARTICLE_CSS_AFTER_META__', articleCssAfterMeta)
      .replace(/__ASSETS_DIR__/g, config.output.dirs.assets)
      .replace(/__RES_DIR__/g, config.output.dirs.res)
      .replace(/__MW_DIR__/g, config.output.dirs.mediawiki)
      .replace(/__RELATIVE_FILE_PATH__/g, getRelativeFilePath(articleId, ''))
      .replace('__ARTICLE_BODY_CSS_CLASS__', bodyCssClass)
      .replace('__ARTICLE_HTML_CSS_CLASS__', htmlCssClass)
      .replace('__ARTICLE_FIRST_HEADING_STYLE__', hideFirstHeading ? 'style="display: none;"' : '')

    return domino.createDocument(htmlTemplateString)
  }

  public async download(downloadOpts: DownloadOpts): Promise<DownloadRes> {
    const { articleId, articleUrl } = downloadOpts

    let data: any
    try {
      data = await Downloader.getJSON<any>(articleUrl)
    } catch (err) {
      if (err instanceof DownloadError && err.responseData.error?.code === 'missingtitle') {
        // For missing articles, query log events searching for a recent move, and if found check
        // if it has been done without redirect left behind. If so, download content from the new
        // article location
        const logEvents = await Downloader.getLogEvents('move', articleId)
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
        data = await Downloader.getJSON<any>(Downloader.getArticleUrl(logEvent.params.target_title))
      } else if (err instanceof DownloadError && err.responseData.error?.code === 'nosuchsection') {
        // For articles without the specified section, get the whole article instead
        logger.warn(`Can't get a specific section of article "${articleId}", getting the complete article instead.`)
        data = await Downloader.getJSON<any>(Downloader.getArticleUrl(articleId))
      } else {
        throw err
      }
    }

    if (!data.parse) {
      throw new DownloadError('ActionParse response is empty', articleUrl, null, null, data)
    }

    // Remove user specific module dependencies
    const styleDependenciesList = data.parse.modulestyles.filter((oneCssDep: string) => {
      return !oneCssDep.startsWith('user')
    })
    /*const jsDependenciesList = data.parse.modules.filter((oneJsDep: string) => {
      return !oneJsDep.startsWith('user')
    })*/

    const moduleDependencies = {
      // Do not add JS-related stuff for now with ActionParse, see #2310
      jsConfigVars: '', // DownloaderClass.extractJsConfigVars(data.parse.headhtml),
      jsDependenciesList: [], // config.output.mw.js_simplified.concat(jsDependenciesList),
      styleDependenciesList: config.output.mw.css_simplified.concat(styleDependenciesList),
    }

    const normalizedRedirects = data.parse.redirects.map((redirect) => {
      // The API returns the redirect title (!?), we fake the
      // redirectId by putting the underscore.
      redirect.from = String(redirect.from).replace(/ /g, '_')
      redirect.to = String(redirect.to).replace(/ /g, '_')
      return redirect
    })

    const bodyCssClass = extractBodyCssClass(data.parse.headhtml)
    const htmlCssClass = extractHtmlCssClass(data.parse.headhtml)

    return {
      data: data.parse.text,
      moduleDependencies,
      redirects: normalizedRedirects,
      displayTitle: data.parse.displaytitle,
      articleSubtitle: data.parse.subtitle,
      bodyCssClass,
      htmlCssClass,
    }
  }

  public async render(renderOpts: RenderOpts): Promise<any> {
    const result: RenderOutput = []
    const { data, articleId, articleSubtitle, moduleDependencies, bodyCssClass, htmlCssClass, dump } = renderOpts
    let { displayTitle } = renderOpts

    if (!data) {
      throw new Error('Cannot render missing data into an article')
    }

    const articleDetail = await renderOpts.articleDetailXId.get(articleId)

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

    // Add CSS-only gadgets which are used on this article
    const { cssGadgets } = Gadgets.getActiveGadgetsByType(articleDetail)
    cssGadgets.sort().map((gadgetId) => {
      moduleDependencies.styleDependenciesList.push(`ext.gadget.${gadgetId}`)
    })
    /*jsGadgets.map((gadgetId) => {
      moduleDependencies.jsDependenciesList.push(`ext.gadget.${gadgetId}`)
    })*/

    const { finalHTML, mediaDependencies, videoDependencies, imageDependencies, subtitles } = await super.processHtml({
      html: htmlDocument.documentElement.outerHTML,
      dump,
      articleId,
      articleDetail,
      displayTitle,
      articleSubtitle,
      moduleDependencies,
      callback: this.templateDesktopArticle.bind(this, bodyCssClass, htmlCssClass, hideFirstHeading),
    })

    result.push({
      articleId,
      displayTitle: articleId.replace(/_/g, ' '),
      html: finalHTML,
      mediaDependencies,
      videoDependencies,
      imageDependencies,
      moduleDependencies,
      staticFiles: this.staticFilesList,
      subtitles,
    })
    return result
  }
}
