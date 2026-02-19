import ActionParseUrlDirector from '../../../../src/util/builders/url/action-parse.director.js'

describe('ActionParseUrlDirector', () => {
  const actionParseUrlDirector = new ActionParseUrlDirector('https://en.wikipedia.org/', 'vector', 'zh-cn')

  describe('buildArticleURL', () => {
    it('should build a URL object with query params to get article', () => {
      const url = actionParseUrlDirector.buildArticleURL('article-123')

      expect(url).toBe(
        'https://en.wikipedia.org/?action=parse&format=json&prop=modules%7Cjsconfigvars%7Cheadhtml%7Ctext%7Cdisplaytitle%7Csubtitle&usearticle=1&disabletoc=1&disableeditsection=1&disablelimitreport=1&page=article-123&useskin=vector&variant=zh-cn&redirects=1&formatversion=2&maxlag=5',
      )
    })
  })
})
