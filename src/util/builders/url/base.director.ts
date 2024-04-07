import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on base URL
 */
export default class BaseURLDirector {
  private baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain
  }

  buildURL(path: string) {
    return urlBuilder.setDomain(this.baseDomain).setPath(path).build(true)
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

  buildMediawikiRestApiUrl(path?: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath(path ?? 'w/rest.php/v1/page/')
      .build(true, '/')
  }
}
