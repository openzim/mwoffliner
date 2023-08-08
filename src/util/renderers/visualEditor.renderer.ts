import domino from 'domino'
import * as logger from '../../Logger.js'
import { Renderer } from './abstractRenderer.js'
import { DELETED_ARTICLE_ERROR } from '../const.js'
import { MWRendererArgs } from './article.renderer.js'

/*
Represent 'https://{wikimedia-wiki}/w/api.php?action=visualeditor&mobileformat=html&format=json&paction=parse&page='
or
'https://{3rd-part-wikimedia-wiki}/w/api.php?action=visualeditor&mobileformat=html&format=json&paction=parse&page='
*/
export class VisualEditorRenderer extends Renderer {
  private data
  private articleId
  private articleDetail
  private isMainPage

  constructor(mwRendererArgs: MWRendererArgs) {
    super()
    this.data = mwRendererArgs.data
    this.articleId = mwRendererArgs.articleId
    this.articleDetail = mwRendererArgs.articleDetail
    this.isMainPage = mwRendererArgs.isMainPage
  }

  public async render(): Promise<any> {
    if (!this.data) {
      throw new Error(`Cannot render [${this.data}] into an article`)
    }

    if (this.data.visualeditor) {
      // Testing if article has been deleted between fetching list and downloading content.
      if (this.data.visualeditor.oldid === 0) {
        logger.error(DELETED_ARTICLE_ERROR)
        throw new Error(DELETED_ARTICLE_ERROR)
      }
      return this.isMainPage ? this.data.visualeditor.content : this.injectHeader(this.data.visualeditor.content, this.articleDetail)
    } else if (this.data.contentmodel === 'wikitext' || (this.data.html && this.data.html.body)) {
      return this.data.html.body
    } else if (this.data.error) {
      logger.error(`Error in retrieved article [${this.articleId}]:`, this.data.error)
      return ''
    }

    return this.data
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
