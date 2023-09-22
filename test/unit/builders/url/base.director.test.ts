import BaseURLDirector from '../../../../src/util/builders/url/base.director.js'

describe('BaseURLDirector', () => {
  const baseUrlDirector = new BaseURLDirector('https://en.m.wikipedia.com/')

  describe('buildURL', () => {
    it('should return URL object with path', () => {
      const url = baseUrlDirector.buildURL('v1/test/api')

      expect(url.href).toBe('https://en.m.wikipedia.com/v1/test/api')
    })
  })

  describe('buildWikimediaApiURL', () => {
    it('should return rest URL with provided path and trailing char at the end', () => {
      const url = baseUrlDirector.buildWikimediaApiURL('api/rest_v2')

      expect(url.href).toBe('https://en.m.wikipedia.com/api/rest_v2/')
    })

    it('should return rest URL with default path and trailing char at the end', () => {
      const url = baseUrlDirector.buildWikimediaApiURL()

      expect(url.href).toBe('https://en.m.wikipedia.com/api/rest_v1/')
    })
  })

  describe('buildMobileApiUrl', () => {
    it('should return mobile rest URL with provided path and trailing char', () => {
      const url = baseUrlDirector.buildMobileApiUrl('api/rest_v2/page/mobile-html')

      expect(url.href).toBe('https://en.m.wikipedia.com/api/rest_v2/page/mobile-html/')
    })

    it('should return mobile rest URL with default path and trailing char', () => {
      const url = baseUrlDirector.buildMobileApiUrl()

      expect(url.href).toBe('https://en.m.wikipedia.com/api/rest_v1/page/mobile-html/')
    })
  })

  describe('buildDesktopApiUrl', () => {
    it('should return a desktop URL with provided path and trailing char', () => {
      const url = baseUrlDirector.buildDesktopApiUrl('api/rest_v2/page/html')

      expect(url.href).toBe('https://en.m.wikipedia.com/api/rest_v2/page/html/')
    })

    it('should return a desktop URL with default path and trailing char', () => {
      const url = baseUrlDirector.buildDesktopApiUrl()

      expect(url.href).toBe('https://en.m.wikipedia.com/api/rest_v1/page/html/')
    })
  })

  describe('buildModuleURL', () => {
    it('should return a module URL with provided path and question mark as a trailing char', () => {
      const url = baseUrlDirector.buildModuleURL('w/reload.php')

      expect(url).toBe('https://en.m.wikipedia.com/w/reload.php?')
    })

    it('should return a module URL with default path and question mark as a trailing char', () => {
      const url = baseUrlDirector.buildModuleURL()

      expect(url).toBe('https://en.m.wikipedia.com/w/load.php?')
    })
  })
})
