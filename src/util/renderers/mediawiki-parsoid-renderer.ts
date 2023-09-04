import domino from 'domino'
import { DELETED_ARTICLE_ERROR } from '../const.js'
import * as logger from '../../Logger.js'
import { Renderer } from './abstract.renderer.js'
import { getStrippedTitleFromHtml } from '../misc.js'
import { RenderOpts } from './abstract.renderer.js'

/*
Represent 'https://{wikimedia-wiki}/w/api.php?action=parse&format=json&prop=text|revid|modules|jsconfigvars|headhtml|text&parsoid=1&formatversion=2&page={title}'
or
https://{3rd-part-wikimedia-wiki}/w/api.php?action=parse&format=json&prop=text|revid|modules|jsconfigvars|headhtml|text&parsoid=1&formatversion=2&page={title}
*/
export class MediawikiParsoidRenderer extends Renderer {
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
    if (data.parse) {
      // Testing if article has been deleted between fetching list and downloading content.
      if (data.parse.revid === 0) {
        logger.error(DELETED_ARTICLE_ERROR)
        throw new Error(DELETED_ARTICLE_ERROR)
      }
      const dataHtml = isMainPage ? data.parse.text['*'] : this.injectHeader(data.parse.text['*'], articleDetail)
      strippedTitle = getStrippedTitleFromHtml(dataHtml)
      result.push({
        articleId,
        displayTitle: strippedTitle || articleId.replace('_', ' '),
        html: dataHtml,
        modules: data.parse.modules || '',
        modulescripts: data.parse.modulescripts || '',
        modulestyles: data.parse.modulestyles || '',
        headhtml: data.parse.headhtml['*'] || '',
      })
      return result
    } else if (data.error) {
      logger.error(`Error in retrieved article [${articleId}]:`, data.error)
      return ''
    }
    logger.error('Unable to parse data from mediawiki parsoid')
    return ''
  }

  // TODO: this was moved to the abstract renderer in PR1886
  private injectHeader(content: string, articleDetail: any): string {
    const doc = domino.createDocument(content)
    const header = doc.createElement('h1')

    if (articleDetail?.title) {
      header.appendChild(doc.createTextNode(articleDetail.title))
      header.classList.add('article-header')

      const target = doc.querySelector('body.mw-body-content') || doc.querySelector('body')

      if (target) {
        target.insertAdjacentElement('afterbegin', header)
      }
    }

    return doc.documentElement.outerHTML
  }
}
