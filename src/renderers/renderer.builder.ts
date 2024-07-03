import MediaWiki from './../MediaWiki.js'
import { Renderer } from './abstract.renderer.js'
import { VisualEditorRenderer } from './visual-editor.renderer.js'
import { WikimediaDesktopRenderer } from './wikimedia-desktop.renderer.js'
import { WikimediaMobileRenderer } from './wikimedia-mobile.renderer.js'
import { RestApiRenderer } from './rest-api.renderer.js'
import { RendererBuilderOptions } from './abstract.renderer.js'
import * as logger from './../Logger.js'

export class RendererBuilder {
  public async createRenderer(options: RendererBuilderOptions, loginCookie: String): Promise<Renderer> {
    const { renderType, renderName } = options

    const [hasVisualEditorApi, hasWikimediaDesktopApi, hasWikimediaMobileApi, hasRestApi] = await Promise.all([
      MediaWiki.hasVisualEditorApi(loginCookie),
      MediaWiki.hasWikimediaDesktopApi(loginCookie),
      MediaWiki.hasWikimediaMobileApi(loginCookie),
      MediaWiki.hasRestApi(loginCookie),
    ])

    switch (renderType) {
      case 'desktop':
        if (hasWikimediaDesktopApi) {
          // Choose WikimediaDesktopRenderer if it's present, regardless of hasVisualEditorApi value
          return new WikimediaDesktopRenderer()
        } else if (hasVisualEditorApi) {
          return new VisualEditorRenderer()
        } else if (hasRestApi) {
          return new RestApiRenderer()
        } else {
          logger.error('No available desktop renderer.')
          process.exit(1)
        }
      case 'mobile':
        if (hasWikimediaMobileApi) {
          return new WikimediaMobileRenderer()
        }
        logger.error('No available mobile renderer.')
        process.exit(1)
      case 'auto':
        if (hasWikimediaDesktopApi) {
          // Choose WikimediaDesktopRenderer if it's present, regardless of hasVisualEditorApi value
          return new WikimediaDesktopRenderer()
        } else if (hasVisualEditorApi) {
          return new VisualEditorRenderer()
        } else if (hasRestApi) {
          return new RestApiRenderer()
        } else if (hasWikimediaMobileApi) {
          return new WikimediaMobileRenderer()
        } else {
          logger.error('No render available at all.')
          process.exit(1)
        }
      case 'specific':
        // renderName argument is required for 'specific' mode
        return this.handleSpecificRender(renderName, hasVisualEditorApi, hasWikimediaDesktopApi, hasWikimediaMobileApi, hasRestApi)
      default:
        throw new Error(`Unknown render: ${renderType}`)
    }
  }

  private handleSpecificRender(renderName: string, hasVisualEditorApi: boolean, hasWikimediaDesktopApi: boolean, hasWikimediaMobileApi: boolean, hasRestApi: boolean) {
    // renderName argument is required for 'specific' mode
    switch (renderName) {
      case 'WikimediaDesktop':
        if (hasWikimediaDesktopApi) {
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
        if (hasWikimediaMobileApi) {
          return new WikimediaMobileRenderer()
        }
        logger.error('No available mobile renderer.')
        process.exit(1)
      case 'RestApi':
        if (hasRestApi) {
          return new RestApiRenderer()
        }
        logger.error('Cannot create an instance of RestApi renderer.')
        process.exit(1)
      default:
        throw new Error(`Unknown renderName for specific mode: ${renderName}`)
    }
  }
}
