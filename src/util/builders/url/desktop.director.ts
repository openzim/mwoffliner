import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on Downloader desktop URL
 */
export default class WikimediaDesktopURLDirector {
  baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain
  }

  buildArticleURL(articleId: string) {
    return urlBuilder.setDomain(this.baseDomain).setPath(encodeURIComponent(articleId)).build()
  }
}
