import domino from 'domino'
import { Renderer } from './abstract.renderer.js'

/*
Represent 'https://{wikimedia-wiki}/w/api.php?action=visualeditor&mobileformat=html&format=json&paction=parse&page={title}'
or
'https://{3rd-part-wikimedia-wiki}/w/api.php?action=visualeditor&mobileformat=html&format=json&paction=parse&page={title}'
*/
export class VisualEditorRenderer extends Renderer {
  constructor() {
    super()
  }

  public async render(renderOpts: any): Promise<any> {
    const { data, isMainPage, articleDetail } = renderOpts
    if (!data) {
      throw new Error(`Cannot render [${data}] into an article`)
    }
    return isMainPage ? data : this.injectHeader(data, articleDetail)
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
