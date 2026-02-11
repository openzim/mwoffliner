import { config } from '../../../config.js'
import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on MediaWiki API URL
 */
export default class ApiURLDirector {
  private baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain
  }

  buildQueryURL<T extends Record<string, any>>(queryParams: T) {
    return urlBuilder.setDomain(this.baseDomain).setQueryParams(queryParams, '?', true).build()
  }

  buildSiteInfoURL() {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setQueryParams({
        action: 'query',
        meta: 'siteinfo|allmessages',
        siprop: 'general|skins|rightsinfo|namespaces|namespacealiases',
        ammessages: 'tagline',
        amenableparser: '1',
        list: 'gadgets',
        gaprop: 'id|metadata',
        gaallowedonly: '1',
        gaenabledonly: '1',
        format: 'json',
        formatversion: '2',
        maxlag: config.defaults.maxlag,
      })
      .build()
  }

  buildLogEventsQuery(letype: string, articleId: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setQueryParams({ action: 'query', list: 'logevents', letype: letype, letitle: articleId, format: 'json', maxlag: config.defaults.maxlag })
      .build()
  }
}
