import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on MediaWiki mobile URL
 */
export default class WikimediaMobileURLDirector {
  baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  buildArticleURL(articleId: string, articleUrlOpts?: RendererArticleOpts) {
    return urlBuilder.setDomain(this.baseDomain).setPath(encodeURIComponent(articleId)).build()
  }
}
