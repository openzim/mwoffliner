import Downloader from '../Downloader.js'
import { Renderer, renderName } from './abstract.renderer.js'
import { RendererBuilder } from './renderer.builder.js'
import * as logger from '../Logger.js'

class RenderingContext {
  private static instance: RenderingContext

  public articlesRenderer: Renderer

  public static getInstance(): RenderingContext {
    if (!RenderingContext.instance) {
      RenderingContext.instance = new RenderingContext()
    }
    return RenderingContext.instance
  }

  public async createRenderers(forceRender: renderName | null) {
    const rendererBuilder = new RendererBuilder()

    if (forceRender) {
      this.articlesRenderer = await rendererBuilder.createRenderer({
        renderType: 'specific',
        renderName: forceRender,
      })
    } else {
      this.articlesRenderer = await rendererBuilder.createRenderer({ renderType: 'auto' })
    }
    logger.log(`Using ${this.articlesRenderer.constructor.name} for articles renderer`)
    Downloader.setUrlsDirectors(this.articlesRenderer)
  }
}

const instance = RenderingContext.getInstance()
export default instance as RenderingContext
