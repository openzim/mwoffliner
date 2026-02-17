import * as logger from './Logger.js'
import MediaWiki from './MediaWiki.js'

class Gadgets {
  private static instance: Gadgets
  private gadgets: Gadget[] | undefined

  public static getInstance() {
    if (!Gadgets.instance) {
      Gadgets.instance = new Gadgets()
    }
    return Gadgets.instance
  }

  public setGadgets(gadgets: Gadget[]) {
    this.gadgets = gadgets
    logger.info(this.gadgets === undefined ? 'Gadgets are not supported on this wiki' : `${this.gadgets.length} gadgets retrieved`)
  }

  /*
   * Get list of gadgets which are not listed on action=parse results
   */
  public getActiveGadgetsByType(articleDetail: ArticleDetail) {
    const cssGadgets = []
    const jsGadgets = []

    const activeGadgets = (this.gadgets || []).filter((gadget) => {
      const settings = gadget.metadata.settings
      if (settings.skins && settings.skins.length && !settings.skins.includes(MediaWiki.skin)) return false
      if (settings.actions && settings.actions.length && !settings.actions.includes('view')) return false
      if (settings.namespaces && settings.namespaces.length && !settings.namespaces.includes(articleDetail.ns || 0)) return false
      if (settings.contentModels && settings.contentModels.length && !settings.contentModels.includes(articleDetail.contentmodel || 'wikitext')) return false
      return true
    })

    activeGadgets.map((gadget) => {
      const module = gadget.metadata.module
      if (module.peers && module.peers.length) {
        // Only JS Gadgets can have peers
        cssGadgets.push(...module.peers)
        return jsGadgets.push(gadget.id)
      }
      if (module.scripts && module.scripts.length) return jsGadgets.push(gadget.id)
      if (module.dependencies && module.dependencies.length) return jsGadgets.push(gadget.id)
      if (module.datas && module.datas.length) return jsGadgets.push(gadget.id)
      if (module.messages && module.messages.length) return jsGadgets.push(gadget.id)
      // Anything left now is a CSS-only Gagdet
      if (module.styles && module.styles.length) return cssGadgets.push(gadget.id)
    })

    return { cssGadgets, jsGadgets }
  }
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
