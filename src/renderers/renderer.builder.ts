import MediaWiki from './../MediaWiki.js'
import { Renderer, RendererBuilderOptions } from './abstract.renderer.js'
import * as logger from './../Logger.js'
import { ActionParseRenderer } from './action-parse.renderer.js'

export class RendererBuilder {
  public async createRenderer(options: RendererBuilderOptions): Promise<Renderer> {
    const { renderType, renderName } = options

    const [hasActionParseApi, hasModuleApi] = await Promise.all([MediaWiki.hasActionParseApi(), MediaWiki.hasModuleApi()])

    if (!hasModuleApi) {
      logger.error('Module API not available while mandatory')
      process.exit(1)
    }

    switch (renderType) {
      case 'desktop':
        if (hasActionParseApi) {
          return new ActionParseRenderer()
        } else {
          logger.error('No available desktop renderer.')
          process.exit(1)
        }
        break // prettier-ignore
      case 'mobile':
        if (hasActionParseApi) {
          return new ActionParseRenderer()
        } else {
          logger.error('No available mobile renderer.')
          process.exit(1)
        }
        break // prettier-ignore
      case 'auto':
        if (hasActionParseApi) {
          return new ActionParseRenderer()
        } else {
          logger.error('No render available at all.')
          process.exit(1)
        }
        break // prettier-ignore
      case 'specific':
        // renderName argument is required for 'specific' mode
        return this.handleSpecificRender(renderName, hasActionParseApi)
      default:
        throw new Error(`Unknown render: ${renderType}`)
    }
  }

  private handleSpecificRender(renderName: string, hasActionParseApi: boolean) {
    // renderName argument is required for 'specific' mode
    switch (renderName) {
      case 'ActionParse':
        if (hasActionParseApi) {
          return new ActionParseRenderer()
        }
        logger.error('Cannot create an instance of ActionParse renderer.')
        process.exit(1)
        break // prettier-ignore
      default:
        throw new Error(`Unknown renderName for specific mode: ${renderName}`)
    }
  }
}
