import MediaWiki from './../MediaWiki.js'
import { Renderer } from './abstract.renderer.js'
import { VisualEditorRenderer } from './visual-editor.renderer.js'
import { WikimediaDesktopRenderer } from './wikimedia-desktop.renderer.js'
import { WikimediaMobileRenderer } from './wikimedia-mobile.renderer.js'
import { RendererBuilderOptions } from './abstract.renderer.js'
import * as logger from './../Logger.js'

export class RendererBuilder {
  public async createRenderer(options: RendererBuilderOptions): Promise<Renderer> {
    const { renderType, renderName } = options

    const [hasVisualEditorApi, hasWikimediaDesktopApi, hasWikimediaMobileApi] = await Promise.all([
      MediaWiki.hasVisualEditorApi(),
      MediaWiki.hasWikimediaDesktopApi(),
      MediaWiki.hasWikimediaMobileApi(),
    ])

    let errorMessage
    switch (renderType) {
      case 'desktop':
        if (hasWikimediaDesktopApi) {
          // Choose WikimediaDesktopRenderer if it's present, regardless of hasVisualEditorApi value
          return new WikimediaDesktopRenderer()
        } else if (hasVisualEditorApi) {
          return new VisualEditorRenderer()
        } else {
          errorMessage = 'No available desktop renderer.'
          logger.error(errorMessage)
          throw new Error(errorMessage)
        }
      case 'mobile':
        if (hasWikimediaMobileApi) {
          return new WikimediaMobileRenderer()
        }
        errorMessage = 'No available mobile renderer.'
        logger.error(errorMessage)
        throw new Error(errorMessage)
      case 'auto':
        if (hasWikimediaDesktopApi) {
          // Choose WikimediaDesktopRenderer if it's present, regardless of hasVisualEditorApi value
          return new WikimediaDesktopRenderer()
        } else if (hasVisualEditorApi) {
          return new VisualEditorRenderer()
        } else if (hasWikimediaMobileApi) {
          return new WikimediaMobileRenderer()
        } else {
          errorMessage = 'No render available at all.'
          logger.error(errorMessage)
          throw new Error(errorMessage)
        }
      case 'specific':
        // renderName argument is required for 'specific' mode
        switch (renderName) {
          case 'WikimediaDesktop':
            if (hasWikimediaDesktopApi) {
              return new WikimediaDesktopRenderer()
            }
            errorMessage = 'Cannot create an instance of WikimediaDesktop renderer.'
            logger.error(errorMessage)
            throw new Error(errorMessage)
          case 'VisualEditor':
            if (hasVisualEditorApi) {
              return new VisualEditorRenderer()
            }
            errorMessage = 'Cannot create an instance of VisualEditor renderer.'
            logger.error(errorMessage)
            throw new Error(errorMessage)
          case 'WikimediaMobile':
            if (hasWikimediaMobileApi) {
              return new WikimediaMobileRenderer()
            }
            errorMessage = 'No available mobile renderer.'
            logger.error(errorMessage)
            throw new Error(errorMessage)
          default:
            throw new Error(`Unknown renderName for specific mode: ${renderName}`)
        }
      default:
        throw new Error(`Unknown render: ${renderType}`)
    }
  }
}
