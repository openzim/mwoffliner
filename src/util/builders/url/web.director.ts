import urlBuilder from './url.builder.js'

class WebURLDirector {
  buildURL(domain: string, path: string) {
    return urlBuilder.setDomain(domain).setPath(path).build(true)
  }

  buildArticleRawURL(domain: string, articleId: string) {
    return urlBuilder
      .setDomain(domain)
      .setQueryParams({ title: encodeURIComponent(articleId), action: 'raw' })
      .build()
  }
}

const webURLDirector = new WebURLDirector()

export default webURLDirector
