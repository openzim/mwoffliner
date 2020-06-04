import { articleDetailXId } from '../stores';
import { ArticleMcsRenderer } from './ArticleMcsRenderer';
import { ArticleDesktopRenderer } from './ArticleDesktopRenderer';


export interface ArticleRenderingOptions {
  nodet: boolean;
  strings: KVS<string>;
  isMainPage: boolean;
}


export class Article {
  public readonly id: string;
  public readonly json: any;
  public details: ArticleDetail;
  public readonly renderingOptions: ArticleRenderingOptions;
  private readonly isRendered: boolean;


  constructor(id: string, json: any, renderingOptions: ArticleRenderingOptions) {
    this.id = id;
    this.json = json;
    this.renderingOptions = renderingOptions;

    this.isRendered = (
      this.json?.visualeditor
      || this.json?.parse?.text
      || this.json?.contentmodel === 'wikitext'
    ) as boolean;
  }

  public async render(): Promise<RenderedArticle[]> {
    this.details = await articleDetailXId.get(this.id);
    if (this.isRendered) return await ArticleDesktopRenderer.render(this);
    return await ArticleMcsRenderer.render(this);
  }
}
