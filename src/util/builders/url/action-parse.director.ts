import { config } from '../../../config.js'
import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on MediaWiki ActionParse
 */
export default class ActionParseURLDirector {
  baseDomain: string
  skin: string
  variant?: string

  constructor(baseDomain: string, skin: string) {
    this.baseDomain = baseDomain
    this.skin = skin
  }

  buildPageUrl(pageTitle: PageTitle, pageUrlOpts: PageUrlOpts = {}) {
    const { sectionId, langVar, oldid } = pageUrlOpts
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
          page: oldid ? undefined : pageTitle,
          oldid: oldid ? String(oldid) : undefined,
          useskin: this.skin,
          variant: langVar || undefined,
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
