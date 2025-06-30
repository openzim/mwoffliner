import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on MediaWiki visual editor URL
 */
export default class VisualEditorURLDirector {
  baseDomain: string

  constructor(baseDomain: string) {
    this.baseDomain = baseDomain
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  buildArticleURL(articleId: string, articleUrlOpts?: RendererArticleOpts) {
    return urlBuilder.setDomain(this.baseDomain).setQueryParams({ page: articleId }, '&').build()
  }

  get validMimeTypes() {
    return ['application/json']
  }
}
