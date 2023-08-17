import MediaWiki from './../../MediaWiki.js'
import { Renderer } from './abstract.renderer.js'
import { VisualEditorRenderer } from './visual-editor.renderer.js'
import { WikimediaDesktopRenderer } from './wikimedia-desktop.renderer.js'
import { RendererBuilderOptions } from './../saveArticles.js'
import * as logger from './../../Logger.js'

export class RendererBuilder {
  private renderApi: 'VisualEditor' | 'WikimediaDesktop' | 'WikimediaMobile'
  private renderMode: 'auto' | 'desktop' | 'mobile' | 'specific'

  public createRenderer(options: RendererBuilderOptions): Renderer {
    const { RendererMode, RendererAPI } = options

    this.renderMode = RendererMode
    this.renderApi = RendererAPI

    switch (this.renderMode) {
      case 'desktop':
        if (MediaWiki.hasVisualEditorApi && !MediaWiki.hasWikimediaDesktopRestApi) {
          return new VisualEditorRenderer()
        } else if (MediaWiki.hasWikimediaDesktopRestApi) {
          return new WikimediaDesktopRenderer()
        }
        logger.error('No available renderer for desktop mode.')
        process.exit(1)
      case 'mobile':
        // TODO: return WikimediaMobile renderer
        break
      case 'auto':
        // Auto mode is code driven and based on mw api capabilities of specific wiki
        if (MediaWiki.hasVisualEditorApi && !MediaWiki.hasWikimediaDesktopRestApi) {
          return new VisualEditorRenderer()
        } else if (MediaWiki.hasWikimediaDesktopRestApi) {
          return new WikimediaDesktopRenderer()
        }
        logger.error('No available renderer for auto mode.')
        process.exit(1)
      case 'specific':
        // renderApi argument is required for 'specific' mode
        switch (this.renderApi) {
          case 'WikimediaDesktop':
            if (MediaWiki.hasWikimediaDesktopRestApi) {
              return new WikimediaDesktopRenderer()
            }
            logger.error('Cannot create an instance of WikimediaDesktop renderer.')
            process.exit(1)
          case 'VisualEditor':
            if (MediaWiki.hasVisualEditorApi) {
              return new VisualEditorRenderer()
            }
            logger.error('Cannot create an instance of VisualEditor renderer.')
            process.exit(1)
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
