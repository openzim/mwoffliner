import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on MediaWiki REST API URL
 */
export default class RestApiURLDirector {
  baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain
  }

  buildArticleURL(articleId: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath('v1/page/' + encodeURIComponent(articleId) + '/html')
      .build()
  }
}
