import BaseURLDirector from '../../../../src/util/builders/url/base.director.js'

describe('BaseURLDirector', () => {
  const baseUrlDirector = new BaseURLDirector('https://en.wikipedia.com/')

  describe('buildURL', () => {
    it('should return URL object with path', () => {
      const url = baseUrlDirector.buildURL('/v1/test/api')

      expect(url.href).toBe('https://en.wikipedia.com/v1/test/api')
    })

    it('should return URL object with mwActionApiPath param', () => {
      const url = baseUrlDirector.buildURL('/api.php')

      expect(url.href).toBe('https://en.wikipedia.com/api.php')
    })
  })

  describe('buildModuleURL', () => {
    it('should return a module URL with provided path and question mark as a trailing char', () => {
      const url = baseUrlDirector.buildModuleURL('/w/reload.php')

      expect(url).toBe('https://en.wikipedia.com/w/reload.php?')
    })

    it('should return a module URL with default path and question mark as a trailing char', () => {
      const url = baseUrlDirector.buildModuleURL()

      expect(url).toBe('https://en.wikipedia.com/w/load.php?')
    })
  })
})
