import urlBuilder from './url.builder.js'

class ArticleURLDirector {
  buildBaseArticleURL(domain: string) {
    return urlBuilder
      .setDomain(domain)
      .setQueryParams({ action: 'parse', format: 'json', prop: encodeURI('modules|jsconfigvars|headhtml') }, '?')
      .build()
  }

  buildArticleURL(domain: string, articleId: string) {
    return urlBuilder
      .setDomain(domain)
      .setQueryParams({ page: encodeURIComponent(articleId) }, '&')
      .build()
  }
}

const articleURLDirector = new ArticleURLDirector()

export default articleURLDirector
