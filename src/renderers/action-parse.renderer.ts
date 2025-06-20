import domino from 'domino'
import { DownloadOpts, DownloadRes, Renderer, RenderOptsModules } from './abstract.renderer.js'
import { RenderOpts, RenderOutput } from './abstract.renderer.js'
import { config } from '../config.js'
import { genCanonicalLink, genHeaderScript, genHeaderCSSLink, getStaticFiles, getRelativeFilePath } from '../util/misc.js'
import MediaWiki from '../MediaWiki.js'
import { htmlVectorLegacyTemplateCode, htmlVector2022TemplateCode } from '../Templates.js'
import Downloader, { DownloadError } from '../Downloader.js'
import Gadgets from '../Gadgets.js'

// Represent 'https://{wikimedia-wiki}/w/api.php?action=parse&format=json&prop=modules|jsconfigvars|text&parsoid=1&page={article_title}&skin=vector-2022'
export class ActionParseRenderer extends Renderer {
  public staticFilesList: string[] = []
  constructor() {
    super()
    if (this.staticFilesList.length === 0) {
      this.staticFilesList = getStaticFiles(config.output.jsResourcesCommon, config.output.cssResourcesCommon.concat(MediaWiki.skin)).concat('external-link.svg')
    }
  }

  public templateDesktopArticle(moduleDependencies: RenderOptsModules, articleId: string): Document {
    const { jsConfigVars, jsDependenciesList, styleDependenciesList } = moduleDependencies

    const htmlTemplateCode = MediaWiki.skin === 'vector' ? htmlVectorLegacyTemplateCode : MediaWiki.skin === 'vector-2022' ? htmlVector2022TemplateCode : null

    if (!htmlTemplateCode) {
      throw new Error(`Skin ${MediaWiki.skin} is not supported by ActionParse renderer`)
    }

    const articleLangDir = `lang="${MediaWiki.metaData?.langMw || 'en'}" dir="${MediaWiki.metaData?.textDir || 'ltr'}"`
    const articleConfigVarsList = jsConfigVars === '' ? '' : genHeaderScript(config, 'jsConfigVars', articleId, config.output.dirs.mediawiki)
    const articleJsList =
      jsDependenciesList.length === 0 ? '' : jsDependenciesList.map((oneJsDep: string) => genHeaderScript(config, oneJsDep, articleId, config.output.dirs.mediawiki)).join('\n')
    const articleCssList =
      styleDependenciesList.length === 0
        ? ''
        : styleDependenciesList.map((oneCssDep: string) => genHeaderCSSLink(config, oneCssDep, articleId, config.output.dirs.mediawiki)).join('\n')

    const htmlTemplateString = htmlTemplateCode()
      .replace(/__ARTICLE_LANG_DIR__/g, articleLangDir)
      .replace('__ARTICLE_CANONICAL_LINK__', genCanonicalLink(config, MediaWiki.webUrl.href, articleId))
      .replace('__ARTICLE_CONFIGVARS_LIST__', articleConfigVarsList)
      .replace('__ARTICLE_JS_LIST__', articleJsList)
      .replace('__ARTICLE_CSS_LIST__', articleCssList)
      .replace(/__RELATIVE_FILE_PATH__/g, getRelativeFilePath(articleId, ''))

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
      } else {
        throw err
      }
    }

    if (!data.parse) {
      throw new DownloadError('ActionParse response is empty', articleUrl, null, null, data)
    }

    const moduleDependencies = {
      // Do not add JS-related stuff for now with ActionParse, see #2310
      jsConfigVars: '', // DownloaderClass.extractJsConfigVars(data.parse.headhtml['*']),
      jsDependenciesList: [], // config.output.mw.js_simplified.concat(data.parse.modules),
      styleDependenciesList: config.output.mw.css_simplified.concat(data.parse.modulestyles),
    }

    const normalizedRedirects = data.parse.redirects.map((redirect) => {
      // The API returns the redirect title (!?), we fake the
      // redirectId by putting the underscore.
      redirect.from = String(redirect.from).replace(/ /g, '_')
      redirect.to = String(redirect.to).replace(/ /g, '_')
      return redirect
    })

    return { data: data.parse.text['*'], moduleDependencies, redirects: normalizedRedirects }
  }

  public async render(renderOpts: RenderOpts): Promise<any> {
    const result: RenderOutput = []
    const { data, articleId, moduleDependencies, dump } = renderOpts

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

    // Add CSS-only gadgets which are used on this article
    const { cssGadgets } = Gadgets.getActiveGadgetsByType(articleDetail)
    cssGadgets.sort().map((gadgetId) => {
      moduleDependencies.styleDependenciesList.push(`ext.gadget.${gadgetId}`)
    })
    /*jsGadgets.map((gadgetId) => {
      moduleDependencies.jsDependenciesList.push(`ext.gadget.${gadgetId}`)
    })*/

    const { finalHTML, mediaDependencies, videoDependencies, imageDependencies, subtitles } = await super.processHtml(
      htmlDocument.documentElement.outerHTML,
      dump,
      articleId,
      articleDetail,
      moduleDependencies,
      this.templateDesktopArticle.bind(this),
    )

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
