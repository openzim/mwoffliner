import articleURLDirector from '../../../../src/util/builders/url/article.director.js'

describe('ArticleURLDirector', () => {
  describe('buildBaseURL', () => {
    it('should return basic URL for retrieving article', () => {
      const basicArticleURL = articleURLDirector.buildBaseURL('https://en.m.wikipedia.org')

      expect(basicArticleURL).toBe('https://en.m.wikipedia.org?action=parse&format=json&prop=modules%257Cjsconfigvars%257Cheadhtml')
    })
  })

  describe('buildApiURL', () => {
    it('should return a URL for retrieving specific article by id', () => {
      const articleURL = articleURLDirector.buildApiURL('https://en.m.wikipedia.org', 'article-123')

      expect(articleURL).toBe('https://en.m.wikipedia.org?action=parse&format=json&prop=modules%257Cjsconfigvars%257Cheadhtml&page=article-123')
    })
  })
})
