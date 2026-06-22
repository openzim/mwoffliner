import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on MediaWiki Web URL
 */
export default class WebURLDirector {
  baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain
  }

  buildPageRawURL(pageTitle: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setQueryParams({ title: encodeURIComponent(pageTitle), action: 'raw' })
      .build()
  }
}
