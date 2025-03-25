import domino from 'domino'
import { DownloadOpts, DownloadRes, Renderer } from './abstract.renderer.js'
import { RenderOpts, RenderOutput } from './abstract.renderer.js'
import * as logger from '../Logger.js'
import { config } from '../config.js'
import { genCanonicalLink, genHeaderScript, genHeaderCSSLink } from '../util/misc.js'
import MediaWiki from '../MediaWiki.js'
import { htmlWikimediaDesktopTemplateCode } from '../Templates.js'

// Represent 'https://{wikimedia-wiki}/w/api.php?action=parse&format=json&prop=modules|jsconfigvars|headhtml|text&parsoid=1&page={article_title}&skin=vector-2022'
export class ActionParseRenderer extends Renderer {
  constructor() {
    super()
  }

  public templateDesktopArticle(moduleDependencies: any, articleId: string): Document {
    const { jsConfigVars, jsDependenciesList, styleDependenciesList } = moduleDependencies as {
      jsConfigVars
      jsDependenciesList: string[]
      styleDependenciesList: string[]
    }

    const cssLinks = config.output.cssResources.reduce((buf, css) => {
      return buf + genHeaderCSSLink(config, css, articleId)
    }, '')

    const jsScripts = config.output.jsResources.reduce((buf, js) => {
      return (
        buf +
        (js === 'script'
          ? genHeaderScript(config, js, articleId, '', `data-article-id="${articleId.replace(/"/g, '\\\\"')}" id="script-js"`)
          : genHeaderScript(config, js, articleId))
      )
    }, '')

    const htmlTemplateString = htmlWikimediaDesktopTemplateCode()
      .replace('__CSS_LINKS__', cssLinks)
      .replace('__JS_SCRIPTS__', jsScripts)
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
      throw data.error
    }

    const moduleDependencies = {
      jsConfigVars: null, //data.parse.jsconfigvars,
      jsDependenciesList: config.output.mw.js.concat(data.parse.modules),
      styleDependenciesList: config.output.mw.css.concat(data.parse.modulestyles),
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

    const { finalHTML, mediaDependencies, videoDependencies, imageDependencies, subtitles } = await super.processHtml(
      data,
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
      staticFiles: [],
      subtitles,
    })
    return result
  }
}
