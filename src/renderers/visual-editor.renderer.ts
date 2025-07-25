import * as logger from '../Logger.js'
import { DELETED_ARTICLE_ERROR } from '../util/const.js'
import { DesktopRenderer } from './abstractDesktop.render.js'
import { getStrippedTitleFromHtml } from '../util/misc.js'
import { RenderOpts, RenderOutput } from './abstract.renderer.js'
import { DownloadError } from '../Downloader.js'
import { isMainPage } from '../util/articles.js'

/*
Relies on VisualEditor API typically looking like 'https://{wiki-host}/w/api.php?action=visualeditor&mobileformat=html&format=json&paction=parse&page={title}'
*/
export class VisualEditorRenderer extends DesktopRenderer {
  constructor() {
    super()
  }

  private async retrieveHtml(renderOpts: RenderOpts): Promise<any> {
    const { data, articleId, articleDetail } = renderOpts

    /* istanbul ignore if */
    if (!data) {
      throw new Error(`Cannot render [${data}] into an article`)
    }

    let html: string
    let displayTitle: string
    let strippedTitle: string

    if (data.visualeditor) {
      // Testing if article has been deleted between fetching list and downloading content.
      if (data.visualeditor.oldid === 0) {
        logger.error(DELETED_ARTICLE_ERROR)
        throw new DownloadError(DELETED_ARTICLE_ERROR, null, null, null, DELETED_ARTICLE_ERROR)
      }
      html = isMainPage(articleId) ? data.visualeditor.content : super.injectH1TitleToHtml(data.visualeditor.content, articleDetail)
      strippedTitle = getStrippedTitleFromHtml(html)
      displayTitle = strippedTitle || articleId.replace('_', ' ')
      return { html, displayTitle }
    } else if (data.contentmodel === 'wikitext' || (data.html && data.html.body)) {
      html = data.html.body
      strippedTitle = getStrippedTitleFromHtml(html)
      displayTitle = strippedTitle || articleId.replace('_', ' ')

      return { html, displayTitle }
    } else if (data.error) {
      logger.error(`Error in retrieved article [${articleId}]:`, data.error)
      return ''
    }
    logger.error('Unable to parse data from visual editor')
    return ''
  }

  public async render(renderOpts: RenderOpts): Promise<any> {
    const result: RenderOutput = []
    const { articleId, articleDetail, moduleDependencies, dump } = renderOpts
    const { html, displayTitle } = await this.retrieveHtml(renderOpts)
    if (html) {
      const { finalHTML, mediaDependencies, videoDependencies, imageDependencies, subtitles } = await super.processHtml({
        html,
        dump,
        articleId,
        articleDetail,
        moduleDependencies,
        callback: super.templateDesktopArticle.bind(this),
      })
      result.push({
        articleId,
        displayTitle,
        html: finalHTML,
        mediaDependencies,
        videoDependencies,
        imageDependencies,
        moduleDependencies,
        staticFiles: this.staticFilesListDesktop,
        subtitles,
      })
      return result
    }
    return ''
  }
}
