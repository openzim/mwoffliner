import * as logger from '../Logger.js'
import { Renderer } from './abstract.renderer.js'
import { getStrippedTitleFromHtml } from '../util/misc.js'
import { RenderOpts, RenderOutput } from './abstract.renderer.js'

// Represent 'https://{wikimedia-wiki}/api/rest_v1/page/html/'
export class WikimediaMobileRenderer extends Renderer {
  constructor() {
    super()
  }

  private async retrieveHtml(renderOpts: RenderOpts): Promise<any> {
    const { data, articleId, articleDetail, isMainPage } = renderOpts

    const html = isMainPage ? data : super.injectH1TitleToHtml(data, articleDetail)
    const strippedTitle = getStrippedTitleFromHtml(html)
    const displayTitle = strippedTitle || articleId.replace('_', ' ')

    return { html, displayTitle }
  }

  public async render(renderOpts: RenderOpts): Promise<any> {
    try {
      const result: RenderOutput = []
      const { data, articleId, webp, _moduleDependencies, isMainPage, dump } = renderOpts
      const articleDetail = await renderOpts.articleDetailXId.get(articleId)

      const { html, displayTitle } = await this.retrieveHtml(renderOpts)
      if (html) {
        let dataWithHeader = ''
        if (!isMainPage) {
          dataWithHeader = super.injectH1TitleToHtml(data, articleDetail)
        }
        const { finalHTML, subtitles } = await super.processHtml(dataWithHeader || data, dump, articleId, articleDetail, _moduleDependencies, webp)

        result.push({
          articleId,
          displayTitle,
          html: finalHTML,
          mediaDependencies: null,
          subtitles,
        })
        return result
      }
    } catch (err) {
      logger.error(err.message)
      throw new Error(err.message)
    }
  }
}
