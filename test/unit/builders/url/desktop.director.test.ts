import desktopURLDirector from '../../../../src/util/builders/url/desktop.director.js'

describe('DesktopURLDirector', () => {
  describe('buildRestApiURL', () => {
    it('should return a desktop URL with provided path and trailing char', () => {
      const url = desktopURLDirector.buildRestApiURL('https://en.m.wikipedia.org/', 'api/rest_v2/page/html')

      expect(url.href).toBe('https://en.m.wikipedia.org/api/rest_v2/page/html/')
    })

    it('should return a desktop URL with default path and trailing char', () => {
      const url = desktopURLDirector.buildRestApiURL('https://en.m.wikipedia.org/', null)

      expect(url.href).toBe('https://en.m.wikipedia.org/api/rest_v1/page/html/')
    })
  })

  describe('buildArticleURL', () => {
    it('should return the URL to retrieve a desktop article', () => {
      const url = desktopURLDirector.buildArticleURL('https://en.m.wikipedia.org/api/rest_v1/page/html/', 'article-1234')

      expect(url).toBe('https://en.m.wikipedia.org/api/rest_v1/page/html/article-1234')
    })
  })
})
