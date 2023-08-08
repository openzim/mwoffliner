import { MWCapabilities } from '../../Downloader.js'
import { Dump } from '../../Dump.js'

import { Renderer } from './abstractRenderer.js'
import { ParsoidHtmlRestApiRenderer } from './parsoidHtmlRestApi.renderer.js'
import { VisualEditorRenderer } from './visualEditor.renderer.js'

export interface MWRendererArgs {
  mwType: string
  data: any
  articleId: string
  dump: any // TODO: Fix type of dump
  articleDetailXId: RKVS<ArticleDetail>
  capabilities: MWCapabilities
  articleDetail: any
  isMainPage: boolean
}

export class ArticleRenderer {
  private createRenderer(mwRendererArgs: MWRendererArgs): Renderer {
    switch (mwRendererArgs.mwType) {
      case 'visualEditor':
        return new VisualEditorRenderer(mwRendererArgs)
      case 'parsoidHtmlRestApi':
        return new ParsoidHtmlRestApiRenderer(mwRendererArgs)
      default:
        throw new Error(`Unknown renderer type: ${mwRendererArgs.mwType}`)
    }
  }

  private mwRenderer(mwRendererArgs: MWRendererArgs): Promise<any> {
    const renderer = this.createRenderer(mwRendererArgs)
    return renderer.render()
  }

  async renderArticle(
    data: any,
    articleId: string,
    capabilities: MWCapabilities,
    articleDetailXId?: RKVS<ArticleDetail>,
    dump?: Dump,
    articleDetailIn?: ArticleDetail,
  ): Promise<RenderedArticle[]> {
    let articleDetail: ArticleDetail | null
    if (articleDetailIn) {
      articleDetail = articleDetailIn || (await articleDetailXId.get(articleId))
    }

    let isMainPage = false
    if (dump) {
      isMainPage = dump.isMainPage(articleId)
    }

    const mwRendererArgs = {
      mwType: '',
      data,
      articleId,
      dump: Dump,
      articleDetailXId,
      capabilities,
      articleDetail,
      isMainPage,
    }

    // Render visual editor representation of the article
    if (isMainPage || (capabilities.veApiAvailable && !capabilities.desktopRestApiAvailable)) {
      mwRendererArgs.mwType = 'visualEditor'
      return this.mwRenderer(mwRendererArgs)
    }

    // Render Parsoid page/html that comes from Wikimedia REST API
    mwRendererArgs.mwType = 'parsoidHtmlRestApi'
    return this.mwRenderer(mwRendererArgs)
  }
}

const articleRenderer = new ArticleRenderer()

export default articleRenderer
