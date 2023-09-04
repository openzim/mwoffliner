type renderType = 'auto' | 'desktop' | 'mobile' | 'specific'
type renderName = 'VisualEditor' | 'WikimediaDesktop' | 'WikimediaMobile' | 'MediawikiParsoid'

interface RendererBuilderOptionsBase {
  renderType: renderType
}

interface RendererBuilderOptionsCommon {
  renderType: renderType
  renderName?: never
}

interface RendererBuilderOptionsSpecific extends RendererBuilderOptionsBase {
  renderType: 'specific'
  renderName: renderName
}

export type RendererBuilderOptions = RendererBuilderOptionsCommon | RendererBuilderOptionsSpecific

export interface RenderOpts {
  data?: any
  articleId?: string
  articleDetailXId?: RKVS<ArticleDetail>
  articleDetail?: ArticleDetail | string
  isMainPage?: boolean
}

export abstract class Renderer {
  abstract render(renderOpts: RenderOpts): Promise<any>
}
