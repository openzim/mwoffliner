import { DesktopRenderer } from './desktop.renderer.js'
import { VisualEditorRenderer } from './visual-editor.renderer.js'

export class RendererBuilder {
  private renderer: DesktopRenderer | VisualEditorRenderer

  constructor(renderMode: string) {
    this.renderer = this.buildRenderer(renderMode)
  }

  private buildRenderer(renderMode: string) {
    switch (renderMode) {
      case 'desktop':
        return new DesktopRenderer()
      case 'visual-editor':
        return new VisualEditorRenderer()
      default:
        throw new Error(`Unknown mwType: ${renderMode}`)
    }
  }

  public render(renderOpts: any): Promise<any> {
    return this.renderer.render(renderOpts)
  }
}
