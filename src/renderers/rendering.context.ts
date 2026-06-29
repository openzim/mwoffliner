import Downloader from '../Downloader.js'
import { Renderer, renderName } from './abstract.renderer.js'
import { RendererBuilder } from './renderer.builder.js'
import * as logger from '../Logger.js'

class RenderingContext {
  private static instance: RenderingContext

  public pagesRenderer: Renderer

  public static getInstance(): RenderingContext {
    if (!RenderingContext.instance) {
      RenderingContext.instance = new RenderingContext()
    }
    return RenderingContext.instance
  }

  public async createRenderers(forceRender: renderName | null) {
    const rendererBuilder = new RendererBuilder()

    if (forceRender) {
      this.pagesRenderer = await rendererBuilder.createRenderer({
        renderType: 'specific',
        renderName: forceRender,
      })
    } else {
      this.pagesRenderer = await rendererBuilder.createRenderer({ renderType: 'auto' })
    }
    logger.info(`Using ${this.pagesRenderer.constructor.name} for pages renderer`)
    Downloader.setUrlsDirectors(this.pagesRenderer)
  }
}

const instance = RenderingContext.getInstance()
export default instance as RenderingContext
