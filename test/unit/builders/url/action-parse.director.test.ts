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

    it('should use oldid instead of page when oldid is provided (FlaggedRevs stable revision)', () => {
      const url = actionParseUrlDirector.buildArticleURL('article-123', { oldid: 12345 })

      // oldid should be present, page should NOT be present
      expect(url).toContain('oldid=12345')
      expect(url).not.toContain('page=article-123')
      expect(url).toContain('action=parse')
      expect(url).toContain('format=json')
      expect(url).toContain('useskin=vector')
      expect(url).toContain('variant=zh-cn')
    })

    it('should use page (not oldid) when oldid is not provided', () => {
      const url = actionParseUrlDirector.buildArticleURL('article-123', {})

      expect(url).toContain('page=article-123')
      expect(url).not.toContain('oldid=')
    })

    it('should support both sectionId and oldid together', () => {
      const url = actionParseUrlDirector.buildArticleURL('article-123', { sectionId: '2', oldid: 99999 })

      expect(url).toContain('oldid=99999')
      expect(url).toContain('section=2')
      expect(url).not.toContain('page=article-123')
    })
  })
})
