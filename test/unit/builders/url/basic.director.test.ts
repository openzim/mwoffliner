import basicURLDirector from '../../../../src/util/builders/url/basic.director.js'

describe('BasicURLDirector', () => {
  describe('buildMediawikiBaseURL', () => {
    it('should return a basic URL as an URL object with trailing character', () => {
      const url = basicURLDirector.buildMediawikiBaseURL('https://en.m.wikipedia.org')

      expect(url.href).toBe('https://en.m.wikipedia.org/')
    })
  })

  describe('buildApiURL', () => {
    it('should return an API URL as an URL object', () => {
      const url = basicURLDirector.buildApiURL('https://en.m.wikipedia.org/', 'wiki/')

      expect(url.href).toBe('https://en.m.wikipedia.org/wiki/')
    })
  })
})
