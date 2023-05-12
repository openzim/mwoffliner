import urlBuilder from './url.builder.js'

class DesktopURLDirector {
  buildRestApiURL(domain: string, path?: string) {
    return urlBuilder
      .setDomain(domain)
      .setPath(path ?? 'api/rest_v1/page/html')
      .build(true, '/')
  }

  buildArticleURL(domain: string, articleId: string) {
    return urlBuilder.setDomain(domain).setPath(encodeURIComponent(articleId)).build()
  }
}

const desktopURLDirector = new DesktopURLDirector()

export default desktopURLDirector
