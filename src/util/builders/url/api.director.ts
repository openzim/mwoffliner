import urlBuilder from './url.builder.js'

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
    return (
      urlBuilder
        .setDomain(this.baseDomain)
        // TODO: set formatversion: '2' here
        .setQueryParams({ action: 'query', meta: 'siteinfo', siprop: 'namespaces|namespacealiases', format: 'json' })
        .build()
    )
  }

  buildSiteInfoURL() {
    return urlBuilder.setDomain(this.baseDomain).setQueryParams({ action: 'query', meta: 'siteinfo', format: 'json', formatversion: '2' }).build()
  }

  buildVisualEditorURL() {
    return urlBuilder.setDomain(this.baseDomain).setQueryParams({ action: 'visualeditor', mobileformat: 'html', format: 'json', paction: 'parse', page: '' }).build(true)
  }

  buildArticleApiURL(articleId: string) {
    const domain = this.buildBaseArticleURL()

    return urlBuilder.setDomain(domain).setQueryParams({ page: articleId }, '&').build()
  }

  private buildBaseArticleURL() {
    return urlBuilder.setDomain(this.baseDomain).setQueryParams({ action: 'parse', format: 'json', prop: 'modules|jsconfigvars|headhtml', formatversion: '2' }).build()
  }
}
