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

    const [hasVisualEditorApi, hasWikimediaDesktopApi, hasWikimediaMobileApi, hasMediaWikiRESTApi] = await Promise.all([
      MediaWiki.hasVisualEditorApi(),
      MediaWiki.hasWikimediaDesktopApi(),
      MediaWiki.hasWikimediaMobileApi(),
      MediaWiki.hasMediaWikiRESTApi(),
    ])

    switch (renderType) {
      case 'desktop':
        if (hasWikimediaDesktopApi) {
          // Choose WikimediaDesktopRenderer if it's present, regardless of hasVisualEditorApi value
          return new WikimediaDesktopRenderer()
        } else if (hasVisualEditorApi) {
          return new VisualEditorRenderer()
        } else if (hasMediaWikiRESTApi) {
          return new WikimediaDesktopRenderer()
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
        } else if (hasWikimediaMobileApi) {
          return new WikimediaMobileRenderer()
        } else if (hasMediaWikiRESTApi) {
          return new WikimediaDesktopRenderer()
        } else {
          logger.error('No render available at all.')
          process.exit(1)
        }
      case 'specific':
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
          case 'MediawikiRESTApi':
            if (hasMediaWikiRESTApi) {
              return new WikimediaDesktopRenderer()
            }
            logger.error('Cannot create an instance of MediawikiRESTApi renderer.')
            process.exit(1)
          case 'WikimediaMobile':
            if (hasWikimediaMobileApi) {
              return new WikimediaMobileRenderer()
            }
            logger.error('No available mobile renderer.')
            process.exit(1)
          default:
            throw new Error(`Unknown renderName for specific mode: ${renderName}`)
        }
      default:
        throw new Error(`Unknown render: ${renderType}`)
    }
  }
}
