import urlBuilder from './url.builder.js'

class VisualEditorURLDirector {
  buildVisualEditorURL(domain: string) {
    return urlBuilder.setDomain(domain).setQueryParams({ action: 'visualeditor', mobileformat: 'html', format: 'json', paction: 'parse' }).build(true)
  }

  buildVisualEditorArticleURL(domain: string, articleId: string) {
    return urlBuilder
      .setDomain(domain)
      .setQueryParams({ page: encodeURIComponent(articleId) }, '&')
      .build()
  }
}

const visualEditorURLDirector = new VisualEditorURLDirector()

export default visualEditorURLDirector
