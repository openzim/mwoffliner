import domino from 'domino'
import { DownloadOpts, DownloadRes, Renderer } from './abstract.renderer.js'
import { RenderOpts, RenderOutput } from './abstract.renderer.js'
import { config } from '../config.js'
import { genCanonicalLink, genHeaderScript, genHeaderCSSLink, getStaticFiles } from '../util/misc.js'
import MediaWiki from '../MediaWiki.js'
import { htmlVectorLegacyTemplateCode, htmlVector2022TemplateCode } from '../Templates.js'
import Downloader from '../Downloader.js'

// Represent 'https://{wikimedia-wiki}/w/api.php?action=parse&format=json&prop=modules|jsconfigvars|text&parsoid=1&page={article_title}&skin=vector-2022'
export class ActionParseRenderer extends Renderer {
  public staticFilesList: string[] = []
  constructor() {
    super()
    if (this.staticFilesList.length === 0) {
      this.staticFilesList = getStaticFiles(config.output.jsResourcesCommon, config.output.cssResourcesCommon)
    }
  }

  public templateDesktopArticle(moduleDependencies: any, articleId: string): Document {
    const { jsConfigVars, jsDependenciesList, styleDependenciesList } = moduleDependencies as {
      jsConfigVars
      jsDependenciesList: string[]
      styleDependenciesList: string[]
    }

    const htmlTemplateCode = MediaWiki.skin === 'vector' ? htmlVectorLegacyTemplateCode : MediaWiki.skin === 'vector-2022' ? htmlVector2022TemplateCode : null

    if (!htmlTemplateCode) {
      throw new Error(`Skin ${MediaWiki.skin} is not supported by ActionParse renderer`)
    }
    const htmlTemplateString = htmlTemplateCode()
      .replace('__CSS_LINKS__', '') // Unused with ActionParse
      .replace('__JS_SCRIPTS__', '') // Unused with ActionParse
      .replace('__ARTICLE_CANONICAL_LINK__', genCanonicalLink(config, MediaWiki.webUrl.href, articleId))
      .replace('__ARTICLE_CONFIGVARS_LIST__', jsConfigVars !== '' ? genHeaderScript(config, 'jsConfigVars', articleId, config.output.dirs.mediawiki) : '')
      .replace(
        '__ARTICLE_JS_LIST__',
        jsDependenciesList.length !== 0 ? jsDependenciesList.map((oneJsDep) => genHeaderScript(config, oneJsDep, articleId, config.output.dirs.mediawiki)).join('\n') : '',
      )
      .replace(
        '__ARTICLE_CSS_LIST__',
        styleDependenciesList.length !== 0 ? styleDependenciesList.map((oneCssDep) => genHeaderCSSLink(config, oneCssDep, articleId, config.output.dirs.mediawiki)).join('\n') : '',
      )

    const htmlTemplateDoc = domino.createDocument(htmlTemplateString)
    return htmlTemplateDoc
  }

  public async download(downloadOpts: DownloadOpts): Promise<DownloadRes> {
    const { downloader, articleUrl } = downloadOpts

    const data = await downloader.getJSON<any>(articleUrl)
    if (data.error) {
      throw new Error(data.error)
    }

    const moduleDependencies = {
      jsConfigVars: Downloader.extractJsConfigVars(data.parse.headhtml['*']),
      jsDependenciesList: config.output.mw.js_simplified.concat(data.parse.modules),
      styleDependenciesList: config.output.mw.css_simplified.concat(data.parse.modulestyles),
    }

    return { data: data.parse.text['*'], moduleDependencies }
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
