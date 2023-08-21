import domino from 'domino'
import { DELETED_ARTICLE_ERROR } from '../const.js'
import * as logger from '../../Logger.js'
import { Renderer } from './abstract.renderer.js'
import { getStrippedTitleFromHtml } from '../misc.js'
import { RenderOpts } from './abstract.renderer.js'

/*
Represent 'https://{wikimedia-wiki}/w/api.php?action=visualeditor&mobileformat=html&format=json&paction=parse&page={title}'
or
'https://{3rd-part-wikimedia-wiki}/w/api.php?action=visualeditor&mobileformat=html&format=json&paction=parse&page={title}'
*/
export class VisualEditorRenderer extends Renderer {
  constructor() {
    super()
  }

  public async render(renderOpts: RenderOpts): Promise<any> {
    const { data, isMainPage, articleId, articleDetail } = renderOpts

    if (!data) {
      throw new Error(`Cannot render [${data}] into an article`)
    }

    let strippedTitle: string
    const result = []
    if (data.visualeditor) {
      // Testing if article has been deleted between fetching list and downloading content.
      if (data.visualeditor.oldid === 0) {
        logger.error(DELETED_ARTICLE_ERROR)
        throw new Error(DELETED_ARTICLE_ERROR)
      }
      const dataHtml = isMainPage ? data.visualeditor.content : this.injectHeader(data.visualeditor.content, articleDetail)
      strippedTitle = getStrippedTitleFromHtml(dataHtml)
      result.push({
        articleId,
        displayTitle: strippedTitle || articleId.replace('_', ' '),
        html: dataHtml,
      })
      return result
    } else if (data.contentmodel === 'wikitext' || (data.html && data.html.body)) {
      strippedTitle = getStrippedTitleFromHtml(data.html.body)
      result.push({
        articleId,
        displayTitle: strippedTitle || articleId.replace('_', ' '),
        html: data.html.body,
      })
      return result
    } else if (data.error) {
      logger.error(`Error in retrieved article [${articleId}]:`, data.error)
      return ''
    }
    logger.error('Unable to parse data from visual editor')
    return ''
  }

  private injectHeader(content: string, articleDetail: any): string {
    const doc = domino.createDocument(content)
    const header = doc.createElement('h1')

    if (articleDetail?.title) {
      header.appendChild(doc.createTextNode(articleDetail.title))
    }
    header.classList.add('article-header')

    const target = doc.querySelector('body.mw-body-content')

    target.insertAdjacentElement('afterbegin', header)

    return doc.documentElement.outerHTML
  }
}
