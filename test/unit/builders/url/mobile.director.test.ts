import WikimediaMobileURLDirector from '../../../../src/util/builders/url/mobile.director.js'

describe('WikimediaMobileURLDirector', () => {
  const mobuleUrlDirector = new WikimediaMobileURLDirector('https://en.m.wikipedia.org/api/rest_v1/page/mobile-html/')

  describe('buildArticleURL', () => {
    it('should return a URL for retrieving mobile article', () => {
      const url = mobuleUrlDirector.buildArticleURL('article-123')

      expect(url).toBe('https://en.m.wikipedia.org/api/rest_v1/page/mobile-html/article-123')
    })
  })
})
