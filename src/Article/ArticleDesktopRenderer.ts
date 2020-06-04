import domino from 'domino';
import logger from '../Logger';
import { Article } from './Article';
import { ArticleRenderer } from './ArticleRenderer';


/**
 * Here we deal with pre-rendered html. Class named historically.
 */
// todo pull this up
// todo di
export class ArticleDesktopRenderer extends ArticleRenderer {

  public static async render(article: Article): Promise<RenderedArticle[]> {
    const html = this.renderDesktopArticle(article);
    const strippedTitle = this.getStrippedTitleFromHtml(html);
    return [{
      articleId: article.id,  // todo refactor
      displayTitle: strippedTitle || article.id.replace('_', ' '),
      html,
    }];
  }


  private static renderDesktopArticle(article: Article) {
    if (!article.json) {
      throw new Error(`Cannot render [${article.json}] into an article`);
    }
    if (article.json.visualeditor) {
      return article.renderingOptions.isMainPage ? article.json.visualeditor.content : this.injectLeadingSectionTitle(article.json.visualeditor.content, article.details.title);
    } else if (article.json.contentmodel === 'wikitext' || (article.json.html && article.json.html.body)) {
      return article.json.html.body;
    } else if (article.json.parse && article.json.parse.text) {
      return article.json.parse.text['*'];
    } else if (article.json.error) {
      logger.error(`Error in retrieved article [${article.id}]:`, article.json.error);
      return '';
    }
  }


  private static injectLeadingSectionTitle(content: string, title: string): string {
    const doc = domino.createDocument(content);
    const header = doc.createElement('h1');
    header.appendChild(doc.createTextNode(title));
    header.classList.add('article-header');
    const target = doc.querySelector('body.mw-body-content');
    target.insertAdjacentElement('afterbegin', header);
    return doc.documentElement.outerHTML;
  }
}
