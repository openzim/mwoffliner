import urlBuilder from './url.builder.js'
import { TITLE_PLACEHOLDER } from '../../const.js'

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

  buildWikimediaApiURL(path?: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath(path ?? 'api/rest_v1')
      .build(true, '/')
  }

  buildWikimediaDesktopApiUrl(path?: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath(path ?? `api/rest_v1/page/html/${TITLE_PLACEHOLDER}`)
      .build(true, '/')
  }

  buildWikimediaMobileApiUrl(path?: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath(path ?? 'api/rest_v1/page/mobile-html')
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

  buildMediaWikiREST(path?: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath(path ?? `w/rest.php/v1/page/${TITLE_PLACEHOLDER}/html`)
      .build(true, '/')
  }
}
