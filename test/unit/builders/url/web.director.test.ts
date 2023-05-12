import webURLDirector from '../../../../src/util/builders/url/web.director.js'

describe('WebURLDirector', () => {
  describe('buildURL', () => {
    it('should return basic web URL', () => {
      const url = webURLDirector.buildURL('https://en.m.wikipedia.org/', 'w/api.php')

      expect(url.href).toBe('https://en.m.wikipedia.org/w/api.php')
    })
  })
})
