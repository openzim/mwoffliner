import urlBuilder from './url.builder.js'

class WebURLDirector {
  buildWebURL(domain: string, path: string) {
    return urlBuilder.setDomain(domain).setPath(path).build(true)
  }

  buildWebArticleRawURL(domain: string, articleId: string) {
    return urlBuilder
      .setDomain(domain)
      .setQueryParams({ title: encodeURIComponent(articleId), action: 'raw' })
      .build()
  }
}

const webURLDirector = new WebURLDirector()

export default webURLDirector
