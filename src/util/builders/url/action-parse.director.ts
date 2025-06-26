import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on MediaWiki ActionParse
 */
export default class ActionParseURLDirector {
  baseDomain: string
  skin: string

  constructor(baseDomain: string, skin: string) {
    this.baseDomain = baseDomain
    this.skin = skin
  }

  buildArticleURL(articleId: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setQueryParams({
        action: 'parse',
        format: 'json',
        prop: 'modules|jsconfigvars|headhtml|text|displaytitle',
        parsoid: '1',
        page: articleId,
        useskin: this.skin,
        redirects: '1',
        formatversion: '2',
      })
      .build()
  }
}
