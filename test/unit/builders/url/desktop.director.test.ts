import WikimediaDesktopURLDirector from '../../../../src/util/builders/url/desktop.director.js'

describe('WikimediaDesktopURLDirector', () => {
  const wikimediaDesktopUrlDirector = new WikimediaDesktopURLDirector('https://en.m.wikipedia.org/api/rest_v1/page/html/')

  describe('buildArticleURL', () => {
    it('should return the URL to retrieve a desktop article', () => {
      const url = wikimediaDesktopUrlDirector.buildArticleURL('article-1234')

      expect(url).toBe('https://en.m.wikipedia.org/api/rest_v1/page/html/article-1234')
    })
  })
})
