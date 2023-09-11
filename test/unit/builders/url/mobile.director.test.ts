import MobileURLDirector from '../../../../src/util/builders/url/mobile.director.js'

describe('MobileURLDirector', () => {
  const mobuleUrlDirector = new MobileURLDirector('https://en.m.wikipedia.org/api/rest_v1/page/mobile-html/')

  describe('buildArticleURL', () => {
    it('should return a URL for retrieving mobile article', () => {
      const url = mobuleUrlDirector.buildArticleURL('article-123')

      expect(url).toBe('https://en.m.wikipedia.org/api/rest_v1/page/mobile-html/article-123')
    })
  })
})
