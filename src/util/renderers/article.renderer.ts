import domino from 'domino'
import { MWCapabilities } from '../../Downloader.js'
import { Dump } from '../../Dump.js'
import { DELETED_ARTICLE_ERROR } from '../const.js'
import * as logger from '../../Logger.js'
import { getStrippedTitleFromHtml } from '../misc.js'

export class ArticleRenderer {
  async renderArticle(
    json: any,
    articleId: string,
    dump: Dump,
    articleDetailXId: RKVS<ArticleDetail>,
    capabilities: MWCapabilities,
    articleDetailIn?: ArticleDetail,
  ): Promise<RenderedArticle[]> {
    const articleDetail = articleDetailIn || (await articleDetailXId.get(articleId))
    const isMainPage = dump.isMainPage(articleId)

    // TODO: connect capabilities
    if (isMainPage || (capabilities.veApiAvailable && !capabilities.desktopRestApiAvailable)) {
      const html = this.renderDesktopArticle(json, articleId, articleDetail, isMainPage)
      const strippedTitle = getStrippedTitleFromHtml(html)
      return [
        {
          articleId,
          displayTitle: strippedTitle || articleId.replace('_', ' '),
          html,
        },
      ]
    }

    const result = []
    const html = json
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

      if ((articleDetail.subCategories || []).length > 200) {
        await articleDetailXId.set(_articleId, _articleDetail)
      }

      let strippedTitle = getStrippedTitleFromHtml(html)
      if (!strippedTitle) {
        const title = (json.lead || { displaytitle: articleId }).displaytitle
        const doc = domino.createDocument(`<span class='mw-title'>${title}</span>`)
        strippedTitle = doc.getElementsByClassName('mw-title')[0].textContent
      }

      result.push({
        articleId: _articleId,
        displayTitle: (strippedTitle || articleId.replace(/_/g, ' ')) + (i === 0 ? '' : `/${i}`),
        html,
      })
    }

    return result
  }

  renderDesktopArticle(json: any, articleId: string, articleDetail: ArticleDetail, isMainPage = false): string {
    if (!json) {
      throw new Error(`Cannot render [${json}] into an article`)
    }
    if (json.visualeditor) {
      // Testing if article has been deleted between fetching list and downloading content.
      if (json.visualeditor.oldid === 0) {
        logger.error(DELETED_ARTICLE_ERROR)
        throw new Error(DELETED_ARTICLE_ERROR)
      }
      return isMainPage ? json.visualeditor.content : this.injectHeader(json.visualeditor.content, articleDetail)
    } else if (json.contentmodel === 'wikitext' || (json.html && json.html.body)) {
      return json.html.body
    } else if (json.error) {
      logger.error(`Error in retrieved article [${articleId}]:`, json.error)
      return ''
    }
    return json // This is HTML probably (the problem is that this is hard to know at this stage, buggy architecture)
  }

  private injectHeader(content: string, articleDetail: ArticleDetail): string {
    const doc = domino.createDocument(content)
    const header = doc.createElement('h1')

    header.appendChild(doc.createTextNode(articleDetail.title))
    header.classList.add('article-header')

    const target = doc.querySelector('body.mw-body-content')

    target.insertAdjacentElement('afterbegin', header)

    return doc.documentElement.outerHTML
  }
}

const articleRenderer = new ArticleRenderer()

export default articleRenderer
