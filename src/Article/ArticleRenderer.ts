export class ArticleRenderer {
  // public abstract render(article: Article): Promise<RenderedArticle[]>;

  protected static getStrippedTitleFromHtml(html: string): string {
    const title = /<title>(.*)<\/title>/.exec(html.substr(0, 1024));
    return title ? title.shift() : '';
  }
}
