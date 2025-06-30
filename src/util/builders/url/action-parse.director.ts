import urlBuilder from './url.builder.js'

/**
 * Interface to build URLs based on MediaWiki ActionParse
 */
export default class ActionParseURLDirector {
  baseDomain: string
  skin: string

  constructor(baseDomain: string, skin: string) {
    this.baseDomain = baseDomain
    this.skin = skin
  }

  buildArticleURL(articleId: string, articleUrlOpts: RendererArticleOpts = {}) {
    const { sectionId } = articleUrlOpts
    return urlBuilder
      .setDomain(this.baseDomain)
      .setQueryParams(
        {
          action: 'parse',
          format: 'json',
          prop: 'modules|jsconfigvars|headhtml|text|displaytitle',
          usearticle: '1',
          disableeditsection: '1',
          disablelimitreport: '1',
          page: articleId,
          useskin: this.skin,
          redirects: '1',
          formatversion: '2',
          section: sectionId,
        },
        '?',
        true,
      )
      .build()
  }
}
