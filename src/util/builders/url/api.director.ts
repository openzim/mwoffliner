import urlBuilder from './url.builder.js'
import { TITLE_PLACEHOLDER } from '../../const.js'

/**
 * Interface to build URLs based on MediaWiki API URL
 */
export default class ApiURLDirector {
  private baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain
  }

  buildSubCategoriesURL(articleId: string, continueStr = '') {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setQueryParams({
        action: 'query',
        list: 'categorymembers',
        cmtype: 'subcat',
        cmlimit: 'max',
        format: 'json',
        formatversion: '2',
        cmtitle: articleId,
        cmcontinue: continueStr,
      })
      .build()
  }

  buildSiteInfoQueryURL() {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setQueryParams({ action: 'query', meta: 'siteinfo', format: 'json', formatversion: '2', siprop: 'general|namespaces|statistics|variables|category|wikidesc' })
      .build()
  }

  buildQueryURL<T extends Record<string, any>>(queryParams: T) {
    return urlBuilder.setDomain(this.baseDomain).setQueryParams(queryParams, '?', true).build()
  }

  buildNamespacesURL() {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setQueryParams({ action: 'query', meta: 'siteinfo', siprop: 'namespaces|namespacealiases', format: 'json', formatversion: '2' })
      .build()
  }

  buildSiteInfoURL() {
    return urlBuilder.setDomain(this.baseDomain).setQueryParams({ action: 'query', meta: 'siteinfo', format: 'json', formatversion: '2' }).build()
  }

  buildVisualEditorURL() {
<<<<<<< HEAD
    return urlBuilder.setDomain(this.baseDomain).setQueryParams({ action: 'visualeditor', mobileformat: 'html', format: 'json', paction: 'parse', formatversion: '2' }).build(true)
=======
    return urlBuilder
      .setDomain(this.baseDomain)
      .setQueryParams({ action: 'visualeditor', mobileformat: 'html', format: 'json', paction: 'parse', formatversion: '2', page: TITLE_PLACEHOLDER })
      .build(true)
>>>>>>> Switchover to WikimediaDesktop render while using MediawikiRESTApi, add temp workaround with TITLE_PLACEHOLDER for URL builders
  }

  buildArticleApiURL(articleId: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setQueryParams({ action: 'parse', format: 'json', prop: 'modules|jsconfigvars|headhtml', formatversion: '2', page: articleId })
      .build()
  }
}
