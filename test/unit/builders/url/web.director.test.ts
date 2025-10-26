import WebURLDirector from '../../../../src/util/builders/url/web.director.js'

describe('WebURLDirector', () => {
  const webUrlDirector = new WebURLDirector('https://en.wikipedia.org/w/load.php')

  describe('buildArticleRawURL', () => {
    it('should return web URL to get an article', () => {
      const url = webUrlDirector.buildArticleRawURL('article-123')

      expect(url).toBe('https://en.wikipedia.org/w/load.php?title=article-123&action=raw')
    })
  })
})
