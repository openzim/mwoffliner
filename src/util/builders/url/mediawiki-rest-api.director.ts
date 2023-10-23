import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on MediaWiki REST API URL
 */
export default class MediawikiRESTApiURL {
  baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain
  }

  buildArticleURL(articleId: string) {
    const base = urlBuilder.setDomain(this.baseDomain).build()
    return `${base}/w/rest.php/v1/page/${articleId}/html`
  }
}
