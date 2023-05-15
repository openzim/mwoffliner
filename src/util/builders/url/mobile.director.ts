import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on MediaWiki mobile URL
 */
export default class MobileURLDirector {
  baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain
  }

  buildArticleURL(articleId: string) {
    return urlBuilder.setDomain(this.baseDomain).setPath(encodeURIComponent(articleId)).build()
  }
}
