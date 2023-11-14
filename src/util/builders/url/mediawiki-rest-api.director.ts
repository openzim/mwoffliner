import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on MediaWiki REST API URL
 */
export default class MediawikiRestApiURL {
  baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain
  }

  buildArticleURL(articleId?: string) {
    const base = urlBuilder.setDomain(this.baseDomain).build()
    // TODO: refactor this workaround once PR#1929 is merged
    return articleId ? `${base}/w/rest.php/v1/page/${articleId}/html` : `${base}/w/rest.php/v1/page/`
  }
}
