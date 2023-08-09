import domino from 'domino'
import { Renderer } from './abstract.renderer.js'
import { getStrippedTitleFromHtml } from '../misc.js'

// Represent 'https://{wikimedia-wiki}/api/rest_v1/page/html/'
export class DesktopRenderer extends Renderer {
  constructor() {
    super()
  }

  public async render(renderOpts: any): Promise<any> {
    const { data, articleId, articleDetailXId } = renderOpts
    const articleDetail = renderOpts.articleDetailIn || (await renderOpts.articleDetailXId.get(articleId))
    const result = []
    // Paginate when there are more than 200 subCategories
    const numberOfPagesToSplitInto = Math.max(Math.ceil((articleDetail.subCategories || []).length / 200), 1)
    for (let i = 0; i < numberOfPagesToSplitInto; i++) {
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

      result.push({
        articleId: _articleId,
        displayTitle: (strippedTitle || articleId.replace(/_/g, ' ')) + (i === 0 ? '' : `/${i}`),
        html: data,
      })
    }
    return result
  }
}
