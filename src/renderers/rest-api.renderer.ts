import domino from 'domino'
import { DesktopRenderer } from './abstractDesktop.render.js'
import { getStrippedTitleFromHtml } from '../util/misc.js'
import { RenderOpts, RenderOutput } from './abstract.renderer.js'
import { isMainPage } from '../util/articles.js'

// Represent 'https://{wikimedia-wiki}/api/rest.php/v1/page/html/'
export class RestApiRenderer extends DesktopRenderer {
  constructor() {
    super()
  }

  private async retrieveHtml(data: string, articleId: string): Promise<any> {
    let strippedTitle = getStrippedTitleFromHtml(data)
    if (!strippedTitle) {
      const title = articleId
      const doc = domino.createDocument(`<span class='mw-title'>${title}</span>`)
      strippedTitle = doc.getElementsByClassName('mw-title')[0].textContent
    }

    return strippedTitle
  }

  public async render(renderOpts: RenderOpts): Promise<any> {
    const result: RenderOutput = []
    const { data, articleId, articleDetailXId, moduleDependencies, dump } = renderOpts

    /* istanbul ignore if */
    if (!data) {
      throw new Error(`Cannot render [${data}] into an article`)
    }

    const articleDetail = await articleDetailXId.get(articleId)

    const strippedTitle = await this.retrieveHtml(data, articleId)
    let dataWithHeader = ''
    if (!isMainPage(articleId)) {
      dataWithHeader = super.injectH1TitleToHtml(data, articleDetail)
    }
    const { finalHTML, mediaDependencies, videoDependencies, imageDependencies, subtitles } = await super.processHtml({
      html: dataWithHeader || data,
      dump,
      articleId,
      articleDetail,
      moduleDependencies,
      callback: super.templateDesktopArticle.bind(this),
    })

    result.push({
      articleId,
      displayTitle: (strippedTitle || articleId.replace(/_/g, ' ')),
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
}
