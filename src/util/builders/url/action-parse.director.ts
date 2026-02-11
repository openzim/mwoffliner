import { config } from '../../../config.js'
import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on MediaWiki ActionParse
 */
export default class ActionParseURLDirector {
  baseDomain: string
  skin: string
  variant?: string

  constructor(baseDomain: string, skin: string, variant?: string) {
    this.baseDomain = baseDomain
    this.skin = skin
    this.variant = variant
  }

  buildArticleURL(articleId: string, articleUrlOpts: RendererArticleOpts = {}) {
    const { sectionId } = articleUrlOpts
    return urlBuilder
      .setDomain(this.baseDomain)
      .setQueryParams(
        {
          action: 'parse',
          format: 'json',
          prop: 'modules|jsconfigvars|headhtml|text|displaytitle|subtitle|categorieshtml',
          usearticle: '1',
          disabletoc: '1',
          disableeditsection: '1',
          disablelimitreport: '1',
          page: articleId,
          useskin: this.skin,
          variant: this.variant,
          redirects: '1',
          formatversion: '2',
          section: sectionId,
          maxlag: config.defaults.maxlag,
        },
        '?',
        true,
      )
      .build()
  }
}
