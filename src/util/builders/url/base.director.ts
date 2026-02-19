import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on base URL
 */
export default class BaseURLDirector {
  private baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain.endsWith('/') ? baseDomain.substring(0, baseDomain.length - 1) : baseDomain
  }

  buildURL(path: string) {
    return urlBuilder.setDomain(this.baseDomain).setPath(path).build(true)
  }

  buildModuleURL(path?: string) {
    return urlBuilder
      .setDomain(this.baseDomain)
      .setPath(path ?? '/w/load.php')
      .build(false, '?')
  }
}
