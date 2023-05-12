import mobileURLDirector from '../../../../src/util/builders/url/mobile.director.js'

describe('MobileURLDirector', () => {
  describe('buildRestApiURL', () => {
    it('should return mobile rest URL with provided path and trailing char', () => {
      const url = mobileURLDirector.buildRestApiURL('https://en.m.wikipedia.org/', 'api/rest_v2/page/mobile-sections')

      expect(url.href).toBe('https://en.m.wikipedia.org/api/rest_v2/page/mobile-sections/')
    })

    it('should return mobile rest URL with default path and trailing char', () => {
      const url = mobileURLDirector.buildRestApiURL('https://en.m.wikipedia.org/')

      expect(url.href).toBe('https://en.m.wikipedia.org/api/rest_v1/page/mobile-sections/')
    })
  })

  describe('buildArticleURL', () => {
    it('should return a URL for retrieving mobile article', () => {
      const url = mobileURLDirector.buildArticleURL('https://en.m.wikipedia.org/api/rest_v1/page/mobile-sections/', 'article-123')

      expect(url).toBe('https://en.m.wikipedia.org/api/rest_v1/page/mobile-sections/article-123')
    })
  })
})
