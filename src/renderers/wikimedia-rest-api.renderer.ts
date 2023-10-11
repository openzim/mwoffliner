import * as logger from '../Logger.js'
import { Renderer } from './abstract.renderer.js'
import { getStrippedTitleFromHtml } from '../util/misc.js'
import { RenderOpts, RenderOutput } from './abstract.renderer.js'

/*
Represent 'https://{wikimedia-wiki}/w/rest.php/v1/page/{title}/with_html'
or
'https://{3rd-part-wikimedia-wiki}/w/rest.php/v1/page/{title}/with_html'
*/
export class MediawikiRESTApiRenderer extends Renderer {
  constructor() {
    super()
  }

  private async retrieveHtml(renderOpts: RenderOpts): Promise<any> {
    const { data, articleId, articleDetail, isMainPage } = renderOpts

    if (!data) {
      throw new Error(`Cannot render [${data}] into an article`)
    }

    let html: string
    let displayTitle: string
    let strippedTitle: string

    if (data.html) {
      html = isMainPage ? data.html : super.injectH1TitleToHtml(data.html, articleDetail)
      strippedTitle = getStrippedTitleFromHtml(html)
      displayTitle = strippedTitle || articleId.replace('_', ' ')
      return { html, displayTitle }
    } else if (data.errorKey) {
      logger.error(`Error in retrieved article [${articleId}]:`, data.errorKey)
      return ''
    }
    logger.error('Unable to parse data from visual editor')
    return ''
  }

  public async render(renderOpts: RenderOpts): Promise<any> {
    try {
      const result: RenderOutput = []
      const { articleId, articleDetail, webp, _moduleDependencies, dump } = renderOpts
      const { html, displayTitle } = await this.retrieveHtml(renderOpts)
      if (html) {
        const { finalHTML, mediaDependencies, subtitles } = await super.processHtml(html, dump, articleId, articleDetail, _moduleDependencies, webp)
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
