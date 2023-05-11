import urlBuilder from './url.builder.js'

class BasicURLDirector {
  buildMediawikiBaseURL(domain: string) {
    return urlBuilder.setDomain(domain).build(true, '/')
  }

  buildSiteInfoURL(domain: string) {
    return urlBuilder.setDomain(domain).setQueryParams({ action: 'query', meta: 'siteinfo', format: 'json' }).build()
  }

  buildApiURL(domain: string, path: string) {
    return urlBuilder.setDomain(domain).setPath(path).build(true)
  }
}

const basicURLDirector = new BasicURLDirector()

export default basicURLDirector
