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

  private async retrieveHtml(data: string, i: number, articleId, articleDetail, numberOfPagesToSplitInto: number, articleDetailXId): Promise<any> {
    const pageId = i === 0 ? '' : `__${i}`
    const _articleId = articleId + pageId
    const _articleDetail = Object.assign({}, articleDetail, {
      subCategories: (articleDetail.subCategories || []).slice(i * 200, (i + 1) * 200),
      nextArticleId: numberOfPagesToSplitInto > i + 1 ? `${articleId}__${i + 1}` : null,
      prevArticleId: i - 1 > 0 ? `${articleId}__${i - 1}` : i - 1 === 0 ? articleId : null,
    })

    if (articleDetailXId && (articleDetail.subCategories || []).length > 200) {
      await articleDetailXId.set(_articleId, _articleDetail)
    }

    let strippedTitle = getStrippedTitleFromHtml(data)
    if (!strippedTitle) {
      const title = articleId
      const doc = domino.createDocument(`<span class='mw-title'>${title}</span>`)
      strippedTitle = doc.getElementsByClassName('mw-title')[0].textContent
    }

    return { strippedTitle, _articleId }
  }

  public async render(renderOpts: RenderOpts): Promise<any> {
    const result: RenderOutput = []
    const { data, articleId, articleDetailXId, moduleDependencies, dump } = renderOpts

    /* istanbul ignore if */
    if (!data) {
      throw new Error(`Cannot render [${data}] into an article`)
    }

    const articleDetail = await renderOpts.articleDetailXId.get(articleId)

    // Paginate when there are more than 200 subCategories
    const numberOfPagesToSplitInto = Math.max(Math.ceil((articleDetail.subCategories || []).length / 200), 1)

    for (let i = 0; i < numberOfPagesToSplitInto; i++) {
      const { strippedTitle, _articleId } = await this.retrieveHtml(data, i, articleId, articleDetail, numberOfPagesToSplitInto, articleDetailXId)
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
        articleId: _articleId,
        displayTitle: (strippedTitle || articleId.replace(/_/g, ' ')) + (i === 0 ? '' : `/${i}`),
        html: finalHTML,
        mediaDependencies,
        videoDependencies,
        imageDependencies,
        moduleDependencies,
        staticFiles: this.staticFilesListDesktop,
        subtitles,
      })
    }
    return result
  }
}
