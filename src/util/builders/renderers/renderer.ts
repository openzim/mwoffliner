import { RendererBuilder } from './renderer.builder.js'

export class ArticleRenderer {
  private builder: RendererBuilder = new RendererBuilder()

  public renderArticle(renderOpts: any, renderMode: string): void {
    switch (renderMode) {
      case 'desktop':
        this.builder.setDesktopRenderer(renderOpts)
        break
      case 'visual-editor':
        this.builder.setVisualEditorRenderer(renderOpts)
        break
      default:
        throw new Error(`Unknown mwType: ${renderMode}`)
    }

    const renderer = this.builder.createRenderer()
    return renderer.render()
  }
}
