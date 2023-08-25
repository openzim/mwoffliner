import { DELETED_ARTICLE_ERROR } from '../const.js'
import * as logger from '../../Logger.js'
import { Renderer } from './abstract.renderer.js'
import { getStrippedTitleFromHtml } from '../misc.js'
import { RenderOpts, RenderOutput } from './abstract.renderer.js'

/*
Represent 'https://{wikimedia-wiki}/w/api.php?action=visualeditor&mobileformat=html&format=json&paction=parse&page={title}'
or
'https://{3rd-part-wikimedia-wiki}/w/api.php?action=visualeditor&mobileformat=html&format=json&paction=parse&page={title}'
*/
export class VisualEditorRenderer extends Renderer {
  constructor() {
    super()
  }

  private getDisplayTitleFromVisualEditor(strippedTitle: string, articleId: string) {
    return strippedTitle || articleId.replace('_', ' ')
  }

  private async getHTML(renderOpts: RenderOpts): Promise<any> {
    const { data, articleId, articleDetail, isMainPage } = renderOpts

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
        throw new Error(DELETED_ARTICLE_ERROR)
      }
      html = isMainPage ? data.visualeditor.content : super.injectHeader(data.visualeditor.content, articleDetail)
      strippedTitle = getStrippedTitleFromHtml(html)
      displayTitle = this.getDisplayTitleFromVisualEditor(strippedTitle, articleId)
      return { html, displayTitle }
    } else if (data.contentmodel === 'wikitext' || (data.html && data.html.body)) {
      html = data.html.body
      strippedTitle = getStrippedTitleFromHtml(html)
      displayTitle = this.getDisplayTitleFromVisualEditor(strippedTitle, articleId)

      return { html, displayTitle }
    } else if (data.error) {
      logger.error(`Error in retrieved article [${articleId}]:`, data.error)
      return ''
    }
    logger.error('Unable to parse data from visual editor')
    return ''
  }

  public async render(renderOpts: RenderOpts): Promise<any> {
    try {
      const result: RenderOutput = []
      const { redisStore, articleId, articleDetail, webp, _moduleDependencies, dump } = renderOpts
      const { html, displayTitle } = await this.getHTML(renderOpts)
      if (html) {
        const { finalHTML, mediaDependencies, subtitles } = await super.processHtml(html, redisStore, dump, articleId, articleDetail, _moduleDependencies, webp)
        result.push({
          articleId,
          displayTitle,
          html: finalHTML,
          mediaDependencies,
          subtitles,
        })
        return result
      }
      return ''
    } catch (err) {
      logger.error(err.message)
      throw new Error(err.message)
    }
  }
}
