import { Renderer } from './abstract.js'
import { DesktopRendererDirector } from './desktop.director.js'
import { VisualEditorRendererDirector } from './visual-editor.director.js'

export class RendererBuilder {
  private renderer: Renderer | null = null

  setDesktopRenderer(renderOpts): RendererBuilder {
    this.renderer = new DesktopRendererDirector(renderOpts)
    return this
  }

  setVisualEditorRenderer(renderOpts): RendererBuilder {
    this.renderer = new VisualEditorRendererDirector(renderOpts)
    return this
  }

  createRenderer(): Renderer {
    if (this.renderer === null) {
      throw new Error('Article renderer type is not set.')
    }
    return this.renderer
  }
}
