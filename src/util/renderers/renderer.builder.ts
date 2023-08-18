import MediaWiki from './../../MediaWiki.js'
import { Renderer } from './abstract.renderer.js'
import { VisualEditorRenderer } from './visual-editor.renderer.js'
import { WikimediaDesktopRenderer } from './wikimedia-desktop.renderer.js'
import { RendererBuilderOptions } from './../saveArticles.js'
import * as logger from './../../Logger.js'

export class RendererBuilder {
  private renderApi: 'VisualEditor' | 'WikimediaDesktop' | 'WikimediaMobile'
  private renderMode: 'auto' | 'desktop' | 'mobile' | 'specific'

  public async createRenderer(options: RendererBuilderOptions): Promise<Renderer> {
    const { RendererMode, RendererAPI } = options

    this.renderMode = RendererMode
    this.renderApi = RendererAPI

    const [hasVisualEditorApi, hasWikimediaDesktopRestApi] = await Promise.all([MediaWiki.hasVisualEditorApi(), MediaWiki.hasWikimediaDesktopRestApi()])

    switch (this.renderMode) {
      case 'desktop':
        if (hasWikimediaDesktopRestApi) {
          // Choose WikimediaDesktopRenderer if it's present, regardless of hasVisualEditorApi value
          return new WikimediaDesktopRenderer()
        } else if (hasVisualEditorApi) {
          return new VisualEditorRenderer()
        } else {
          logger.error('No available renderer for desktop mode.')
          process.exit(1)
        }
      case 'mobile':
        // TODO: return WikimediaMobile renderer
        break
      case 'auto':
        if (hasWikimediaDesktopRestApi) {
          // Choose WikimediaDesktopRenderer if it's present, regardless of hasVisualEditorApi value
          return new WikimediaDesktopRenderer()
        } else if (hasVisualEditorApi) {
          return new VisualEditorRenderer()
        } else {
          logger.error('No available renderer for auto mode.')
          process.exit(1)
        }
      case 'specific':
        // renderApi argument is required for 'specific' mode
        switch (this.renderApi) {
          case 'WikimediaDesktop':
            if (hasWikimediaDesktopRestApi) {
              return new WikimediaDesktopRenderer()
            }
            logger.error('Cannot create an instance of WikimediaDesktop renderer.')
            process.exit(1)
          case 'VisualEditor':
            if (hasVisualEditorApi) {
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
