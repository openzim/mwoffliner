import Downloader from './Downloader.js'
import * as logger from './Logger.js'
import MediaWiki from './MediaWiki.js'

class Gadgets {
  private static instance: Gadgets
  private gadgets: Gadget[]

  public static getInstance() {
    if (!Gadgets.instance) {
      Gadgets.instance = new Gadgets()
    }
    return Gadgets.instance
  }

  public async fetchGadgets() {
    const gadgetsUrl = Downloader.apiUrlDirector.buildGadgetsUrl()
    const gadgetsResponse = await Downloader.getJSON<GadgetQueryResult>(gadgetsUrl)
    if (!gadgetsResponse.batchcomplete) {
      throw new Error(`Error while fetching gadgets with ${gadgetsUrl}, batch seems to be incomplete, scraper does not expect/support pagination here`)
    }
    this.gadgets = gadgetsResponse.query.gadgets
    logger.info(`${this.gadgets.length} gadgets retrieved`)
  }

  public getCssOnlyGadgets(articleDetail: ArticleDetail) {
    return (this.gadgets || [])
      .filter((gadget) => {
        const module = gadget.metadata.module
        const settings = gadget.metadata.settings
        if (module.scripts.length || module.datas.length || module.dependencies.length || module.peers.length || module.messages.length) return false
        if (!module.styles.length) return false
        if (settings.skins.length && !settings.skins.includes(MediaWiki.skin)) return false
        if (settings.actions.length && !settings.actions.includes('view')) return false
        if (settings.namespaces.length && !settings.namespaces.includes(articleDetail.ns || 0)) return false
        if (settings.contentModels.length && !settings.contentModels.includes(articleDetail.contentmodel || 'wikitext')) return false
        return true
      })
      .map((gadget) => gadget.id)
  }
}

export interface GadgetQueryResult {
  batchcomplete: boolean
  query: Query
}

export interface Query {
  gadgets: Gadget[]
}

export interface Gadget {
  id: string
  metadata: Metadata
}

export interface Metadata {
  settings: Settings
  module: Module
}

export interface Settings {
  rights: string[]
  skins: string[]
  actions: string[]
  namespaces: number[]
  contentModels: string[]
  default: boolean
  hidden: boolean
  package: boolean
  shared: boolean
  category: string
  legacyscripts: boolean
  requiresES6: boolean
  supportsUrlLoad: boolean
}

export interface Module {
  scripts: string[]
  styles: string[]
  datas: string[]
  dependencies: string[]
  peers: string[]
  messages: string[]
}

export { Gadgets as GadgetsClass }

const gadgets = Gadgets.getInstance()
export default gadgets as Gadgets
