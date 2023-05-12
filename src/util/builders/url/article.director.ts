import urlBuilder from './url.builder.js'

class ArticleURLDirector {
  buildBaseURL(domain: string) {
    return urlBuilder
      .setDomain(domain)
      .setQueryParams({ action: 'parse', format: 'json', prop: encodeURI('modules|jsconfigvars|headhtml') })
      .build()
  }

  buildApiURL(baseDomain: string, articleId: string) {
    const domain = this.buildBaseURL(baseDomain)

    return urlBuilder
      .setDomain(domain)
      .setQueryParams({ page: encodeURIComponent(articleId) }, '&')
      .build()
  }
}

const articleURLDirector = new ArticleURLDirector()

export default articleURLDirector
