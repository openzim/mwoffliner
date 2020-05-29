import domino from 'domino';


export class ArticleRenderer {
  // public abstract render(article: Article): Promise<RenderedArticle[]>;

  protected static getStrippedTitleFromHtml(html: string) {
    const doc = domino.createDocument(html);
    const titleEl = doc.querySelector('title');
    if (titleEl) {
      return titleEl.textContent;
    } else {
      return '';
    }
  }
}
