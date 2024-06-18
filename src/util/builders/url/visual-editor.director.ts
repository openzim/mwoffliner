import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on MediaWiki visual editor URL
 */
export default class VisualEditorURLDirector {
  baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain
  }

  buildArticleURL(articleId: string) {
    return urlBuilder.setDomain(this.baseDomain).setQueryParams({ page: articleId }, '&').build()
  }

  get validMimeTypes() {
    return ['application/json']
  }
}
