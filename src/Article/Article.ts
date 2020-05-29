// todo move logic here

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
  public readonly isMainPage: boolean;
  public details: ArticleDetail;
  public readonly renderingOptions: ArticleRenderingOptions;


  constructor(id: string, json: any, renderingOptions: ArticleRenderingOptions) {
    this.id = id;
    this.json = json;
    this.isMainPage = false; // isMainPage; // todo
    this.renderingOptions = renderingOptions;
  }

  // todo remove the flag (#1139)
  public async render(forceParsoidFallback: boolean = false): Promise<RenderedArticle[]> {
    this.details = await articleDetailXId.get(this.id);

    const useParsoidFallback = forceParsoidFallback || this.json.visualeditor?.result;

    // pick the correct renderer
    // todo remove this (#1139)
    if (useParsoidFallback) {
      return await ArticleDesktopRenderer.render(this);
    } else {
      return await ArticleMcsRenderer.render(this);
    }
  }
}
