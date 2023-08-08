import domino from 'domino'
import { Renderer } from './abstract.js'
import { getStrippedTitleFromHtml } from '../../misc.js'

// Represent 'https://{wikimedia-wiki}/api/rest_v1/page/html/'
export class DesktopRendererDirector extends Renderer {
  private data
  private articleId
  private articleDetail
  private articleDetailXId

  constructor(renderOpts) {
    super()
    this.data = renderOpts.data
    this.articleId = renderOpts.articleId
    this.articleDetail = renderOpts.articleDetail
    this.articleDetailXId = renderOpts.articleDetailXId
  }

  public async render(): Promise<any> {
    const result = []
    if (this.articleDetail) {
      // Paginate when there are more than 200 subCategories
      const numberOfPagesToSplitInto = Math.max(Math.ceil((this.articleDetail.subCategories || []).length / 200), 1)
      for (let i = 0; i < numberOfPagesToSplitInto; i++) {
        const pageId = i === 0 ? '' : `__${i}`
        const _articleId = this.articleId + pageId
        const _articleDetail = Object.assign({}, this.articleDetail, {
          subCategories: (this.articleDetail.subCategories || []).slice(i * 200, (i + 1) * 200),
          nextArticleId: numberOfPagesToSplitInto > i + 1 ? `${this.articleId}__${i + 1}` : null,
          prevArticleId: i - 1 > 0 ? `${this.articleId}__${i - 1}` : i - 1 === 0 ? this.articleId : null,
        })

        if (this.articleDetailXId && (this.articleDetail.subCategories || []).length > 200) {
          await this.articleDetailXId.set(_articleId, _articleDetail)
        }

        let strippedTitle = getStrippedTitleFromHtml(this.data)
        if (!strippedTitle) {
          const title = this.articleId
          const doc = domino.createDocument(`<span class='mw-title'>${title}</span>`)
          strippedTitle = doc.getElementsByClassName('mw-title')[0].textContent
        }

        result.push({
          articleId: _articleId,
          displayTitle: (strippedTitle || this.articleId.replace(/_/g, ' ')) + (i === 0 ? '' : `/${i}`),
          html: this.data,
        })
      }
    }
    return result
  }
}
