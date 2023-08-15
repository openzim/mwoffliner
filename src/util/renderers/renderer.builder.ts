import MediaWiki from './../../MediaWiki.js'
import { Renderer } from './abstract.renderer.js'
import { VisualEditorRenderer } from './visual-editor.renderer.js'
import { WikimediaDesktopRenderer } from './wikimedia-desktop.renderer.js'
import { RendererBuilderOptions } from './../saveArticles.js'

export class RendererBuilder {
  private renderApi: 'VisualEditor' | 'WikimediaDesktop' | 'WikimediaMobile'
  private renderMode: 'auto' | 'desktop' | 'mobile' | 'specific'
  private mw: MediaWiki

  public createRenderer(options: RendererBuilderOptions): Renderer {
    const { mw, RendererMode, RendererAPI } = options

    this.mw = mw
    this.renderMode = RendererMode
    this.renderApi = RendererAPI

    switch (this.renderMode) {
      case 'desktop':
        return new WikimediaDesktopRenderer()
      case 'mobile':
        // TODO: return WikimediaMobile renderer
        break
      case 'auto':
        // Auto mode is code driven and based on mw api capabilities of specific wiki
        if (this.mw.hasVisualEditorApi && !this.mw.hasWikimediaDesktopRestApi) {
          return new VisualEditorRenderer()
        }
        return new WikimediaDesktopRenderer()
      case 'specific':
        // renderApi argument is required for 'specific' mode
        switch (this.renderApi) {
          case 'WikimediaDesktop':
            return new WikimediaDesktopRenderer()
          case 'VisualEditor':
            return new VisualEditorRenderer()
          case 'WikimediaMobile':
            // TODO: return WikimediaMobile renderer
            return
          default:
            throw new Error(`Unknown RendererAPI for specific mode: ${this.renderApi}`)
        }
      default:
        throw new Error(`Unknown render mode: ${this.renderMode}`)
    }
  }
}