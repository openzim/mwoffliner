import urlBuilder from './url.builder.js'
import { WIKIMEDIA_REST_API_PATH } from '../../const.js'

/**
 * Interface to build URLs based on base URL
 */
export default class BaseURLDirector {
  private baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain.endsWith('/') ? baseDomain.substring(0, baseDomain.length - 1) : baseDomain
  }

  buildURL(path: string, params: Record<string, string> = null) {
    let builder = urlBuilder.setDomain(this.baseDomain).setPath(path)
    if (params) {
      builder = builder.setQueryParams(params)
    }
    return builder.build(true)
  }

  buildWikimediaDesktopApiUrl() {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath(WIKIMEDIA_REST_API_PATH + 'page/html')
      .build(true, '/')
  }

  buildWikimediaMobileApiUrl() {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath(WIKIMEDIA_REST_API_PATH + 'page/mobile-html')
      .build(true, '/')
  }

  buildModuleURL(path?: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath(path ?? '/w/load.php')
      .build(false, '?')
  }

  buildMobileModuleURL(path?: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath(path ?? '/api/rest_v1/page/mobile-html-offline-resources')
      .build(false, '/')
  }

  buildRestApiUrl(path?: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath(path ?? '/w/rest.php')
      .build(true, '/')
  }
}
