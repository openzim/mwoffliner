import domino from 'domino'
import { Renderer } from './abstract.js'

/*
Represent 'https://{wikimedia-wiki}/w/api.php?action=visualeditor&mobileformat=html&format=json&paction=parse&page={title}'
or
'https://{3rd-part-wikimedia-wiki}/w/api.php?action=visualeditor&mobileformat=html&format=json&paction=parse&page={title}'
*/
export class VisualEditorRendererDirector extends Renderer {
  private data
  private articleId
  private articleDetail
  private isMainPage

  constructor(renderOpts) {
    super()
    this.data = renderOpts.data
    this.articleId = renderOpts.articleId
    this.articleDetail = renderOpts.articleDetail
    this.isMainPage = renderOpts.isMainPage
  }

  // visualeditor.content returns an HTML for rendering
  public async render(): Promise<any> {
    if (!this.data) {
      throw new Error(`Cannot render [${this.data}] into an article`)
    }
    return this.isMainPage ? this.data.visualeditor.content : this.injectHeader(this.data.visualeditor.content, this.articleDetail)
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
