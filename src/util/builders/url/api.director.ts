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

  buildVisualEditorURL() {
    return urlBuilder.setDomain(this.baseDomain).setQueryParams({ action: 'visualeditor', mobileformat: 'html', format: 'json', paction: 'parse', formatversion: '2' }).build(true)
  }

  buildLogEventsQuery(letype: string, articleId: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setQueryParams({ action: 'query', list: 'logevents', letype: letype, letitle: articleId, format: 'json', maxlag: config.defaults.maxlag })
      .build()
  }

  buildArticleApiURL(articleId: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setQueryParams({ action: 'parse', format: 'json', prop: 'modules|jsconfigvars|headhtml', formatversion: '2', page: articleId, maxlag: config.defaults.maxlag })
      .build()
  }
}
