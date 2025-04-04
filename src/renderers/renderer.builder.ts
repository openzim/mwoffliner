import MediaWiki from './../MediaWiki.js'
import { Renderer, RendererBuilderOptions } from './abstract.renderer.js'
import { VisualEditorRenderer } from './visual-editor.renderer.js'
import { WikimediaDesktopRenderer } from './wikimedia-desktop.renderer.js'
import { WikimediaMobileRenderer } from './wikimedia-mobile.renderer.js'
import { RestApiRenderer } from './rest-api.renderer.js'
import * as logger from './../Logger.js'
import Downloader from 'src/Downloader.js'
import { ActionParseRenderer } from './action-parse.renderer.js'

export class RendererBuilder {
  public async createRenderer(downloader: Downloader, options: RendererBuilderOptions): Promise<Renderer> {
    const { renderType, renderName } = options

    const [hasVisualEditorApi, hasWikimediaDesktopApi, hasWikimediaMobileApi, hasRestApi, hasActionParseApi] = await Promise.all([
      MediaWiki.hasVisualEditorApi(downloader),
      MediaWiki.hasWikimediaDesktopApi(downloader),
      MediaWiki.hasWikimediaMobileApi(downloader),
      MediaWiki.hasRestApi(downloader),
      MediaWiki.hasActionParseApi(downloader),
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
        } else if (hasActionParseApi) {
          return new ActionParseRenderer()
        } else {
          logger.error('No available desktop renderer.')
          process.exit(1)
        }
        break // prettier-ignore
      case 'mobile':
        if (hasWikimediaMobileApi) {
          return new WikimediaMobileRenderer()
        }
        logger.error('No available mobile renderer.')
        process.exit(1)
        break // prettier-ignore
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
        } else if (hasActionParseApi) {
          return new ActionParseRenderer()
        } else {
          logger.error('No render available at all.')
          process.exit(1)
        }
        break // prettier-ignore
      case 'specific':
        // renderName argument is required for 'specific' mode
        return this.handleSpecificRender(renderName, hasVisualEditorApi, hasWikimediaDesktopApi, hasWikimediaMobileApi, hasRestApi, hasActionParseApi)
      default:
        throw new Error(`Unknown render: ${renderType}`)
    }
  }

  private handleSpecificRender(
    renderName: string,
    hasVisualEditorApi: boolean,
    hasWikimediaDesktopApi: boolean,
    hasWikimediaMobileApi: boolean,
    hasRestApi: boolean,
    hasActionParseApi: boolean,
  ) {
    // renderName argument is required for 'specific' mode
    switch (renderName) {
      case 'ActionParse':
        if (hasActionParseApi) {
          return new ActionParseRenderer()
        }
        logger.error('Cannot create an instance of ActionParse renderer.')
        process.exit(1)
        break // prettier-ignore
      case 'WikimediaDesktop':
        if (hasWikimediaDesktopApi) {
          return new WikimediaDesktopRenderer()
        }
        logger.error('Cannot create an instance of WikimediaDesktop renderer.')
        process.exit(1)
        break // prettier-ignore
      case 'VisualEditor':
        if (hasVisualEditorApi) {
          return new VisualEditorRenderer()
        }
        logger.error('Cannot create an instance of VisualEditor renderer.')
        process.exit(1)
        break // prettier-ignore
      case 'WikimediaMobile':
        if (hasWikimediaMobileApi) {
          return new WikimediaMobileRenderer()
        }
        logger.error('No available mobile renderer.')
        process.exit(1)
        break // prettier-ignore
      case 'RestApi':
        if (hasRestApi) {
          return new RestApiRenderer()
        }
        logger.error('Cannot create an instance of RestApi renderer.')
        process.exit(1)
        break // prettier-ignore
      default:
        throw new Error(`Unknown renderName for specific mode: ${renderName}`)
    }
  }
}
