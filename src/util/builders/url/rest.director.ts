import urlBuilder from './url.builder.js'

class RestURLDirector {
  buildRestURL(domain: string, path: string) {
    return urlBuilder
      .setDomain(domain)
      .setPath(path ?? 'api/rest_v1')
      .build(true, '/')
  }
}

const restURLDirector = new RestURLDirector()

export default restURLDirector
