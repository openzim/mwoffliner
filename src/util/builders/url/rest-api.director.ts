import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on MediaWiki REST API URL
 */
export default class RestApiURLDirector {
  baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  buildArticleURL(articleId: string, articleUrlOpts?: RendererArticleOpts) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath('v1/page/' + encodeURIComponent(articleId) + '/html')
      .build()
  }
}
