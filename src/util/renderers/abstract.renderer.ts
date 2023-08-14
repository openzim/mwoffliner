import { RenderOpts } from './../../Downloader.js'
export abstract class Renderer {
  abstract render(renderOpts: RenderOpts): Promise<any>
}
