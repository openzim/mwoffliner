import * as domino from 'domino'
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
        const { finalHTML, subtitles, mediaDependencies } = await super.processHtml(data, dump, articleId, articleDetail, _moduleDependencies, webp)
        // TODO: Add mobile scripts after all treatments but this need to be refactored
        // TODO: enable reference list
        const dataWithMobileModules = this.addMobileModules(finalHTML)
        result.push({
          articleId,
          displayTitle,
          html: dataWithMobileModules,
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

  private addMobileModules(data) {
    const doc = domino.createDocument(data)
    const protocol = 'https://'
    // TODO: query this instead of hardcoding.
    const offlineResourcesCSSList = [
      'meta.wikimedia.org/api/rest_v1/data/css/mobile/base',
      'meta.wikimedia.org/api/rest_v1/data/css/mobile/pcs',
      'en.wikipedia.org/api/rest_v1/data/css/mobile/site',
    ]
    const offlineResourcesJSList = ['meta.wikimedia.org/api/rest_v1/data/javascript/mobile/pcs']

    offlineResourcesCSSList.forEach((cssUrl) => {
      const linkEl = doc.createElement('link') as DominoElement
      Object.assign(linkEl, { rel: 'stylesheet', href: `${protocol}${cssUrl}` })
      doc.head.appendChild(linkEl)
    })

    offlineResourcesJSList.forEach((jsUrl) => {
      const scriptEl = doc.createElement('script') as DominoElement
      scriptEl.setAttribute('src', `${protocol}${jsUrl}`)
      doc.head.appendChild(scriptEl)
    })

    return doc.documentElement.outerHTML
  }
}
