import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on base URL
 */
export default class BaseURLDirector {
  private baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain
  }

  buildURL(path: string, wikiPath = '') {
    path = this.stripLeadingSlash(path)
    wikiPath = this.stripLeadingSlash(wikiPath)
    if (wikiPath && !wikiPath.endsWith('/')) {
      wikiPath += '/'
    }
    path = `${wikiPath}${path}`
    return urlBuilder.setDomain(this.baseDomain).setPath(path).build(true)
  }

  buildWikimediaApiURL(path?: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath(path ?? 'api/rest_v1')
      .build(true, '/')
  }

  buildWikimediaDesktopApiUrl(path?: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath(path ? `${path}/page/html` : 'api/rest_v1/page/html')
      .build(true, '/')
  }

  buildWikimediaMobileApiUrl(path?: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath(path ? `${path}/page/mobile-html` : 'api/rest_v1/page/mobile-html')
      .build(true, '/')
  }

  buildModuleURL(path?: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath(path ?? 'w/load.php')
      .build(false, '?')
  }

  buildMobileModuleURL(path?: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath(path ?? 'api/rest_v1/page/mobile-html-offline-resources')
      .build(false, '/')
  }

  private stripLeadingSlash(s) {
    return s?.startsWith('/') ? s.slice(1) : s
  }
}
