import urlBuilder from './url.builder.js'

class VisualEditorURLDirector {
  buildURL(domain: string) {
    return urlBuilder.setDomain(domain).setQueryParams({ action: 'visualeditor', mobileformat: 'html', format: 'json', paction: 'parse' }).build(true)
  }

  buildArticleURL(domain: string, articleId: string) {
    return urlBuilder
      .setDomain(domain)
      .setQueryParams({ page: encodeURIComponent(articleId) }, '&')
      .build()
  }
}

const visualEditorURLDirector = new VisualEditorURLDirector()

export default visualEditorURLDirector
