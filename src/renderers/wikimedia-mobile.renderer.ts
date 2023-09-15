import * as logger from '../Logger.js'
import { Renderer } from './abstract.renderer.js'
import { getStrippedTitleFromHtml } from '../util/misc.js'
import { RenderOpts, RenderOutput } from './abstract.renderer.js'

// Represent 'https://{wikimedia-wiki}/api/rest_v1/page/mobile-html/'
export class WikimediaMobileRenderer extends Renderer {
  constructor() {
    super()
  }

  private getStrippedTitle(renderOpts: RenderOpts): string {
    const { data, articleId } = renderOpts

    const strippedTitle = getStrippedTitleFromHtml(data)
    return strippedTitle || articleId.replace('_', ' ')
  }

  public async render(renderOpts: RenderOpts): Promise<any> {
    try {
      const result: RenderOutput = []
      const { data, articleId, webp, _moduleDependencies, dump } = renderOpts
      const articleDetail = await renderOpts.articleDetailXId.get(articleId)

      const displayTitle = this.getStrippedTitle(renderOpts)
      if (data) {
        // TODO: Apply mobile page transformations before applying other treatments
        const { subtitles, mediaDependencies } = await super.processHtml(data, dump, articleId, articleDetail, _moduleDependencies, webp)

        // TODO: styles, scripts and most of content are not visible in Kiwix app, but enabled when use Kiwix server
        result.push({
          articleId,
          displayTitle,
          html: data,
          mediaDependencies,
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
