import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on MediaWiki ActionParse
 */
export default class ActionParseURLDirector {
  baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain
  }

  buildArticleURL(articleId: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setQueryParams({ action: 'parse', format: 'json', prop: 'modules|jsconfigvars|headhtml|text', parsoid: '1', page: encodeURIComponent(articleId), useskin: 'vector-2022' })
      .build()
  }
}
