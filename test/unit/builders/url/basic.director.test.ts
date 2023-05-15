import basicURLDirector from '../../../../src/util/builders/url/basic.director.js'

describe('BasicURLDirector', () => {
  describe('buildMediawikiBaseURL', () => {
    it('should return a basic URL as an URL object with trailing character', () => {
      const url = basicURLDirector.buildMediawikiBaseURL('https://en.m.wikipedia.org')

      expect(url.href).toBe('https://en.m.wikipedia.org/')
    })
  })

  describe('buildDownloaderBaseUrl', () => {
    it('should return the first value because its condition is true', () => {
      const conditions = [
        { condition: true, value: 'https://en.wikipedia.org' },
        { condition: false, value: 'https://en.vikidia.org' },
      ]

      const url = basicURLDirector.buildDownloaderBaseUrl(conditions)

      expect(url).toBe('https://en.wikipedia.org')
    })

    it('should return the middle value because its condition is true and first one is false', () => {
      const conditions = [
        { condition: false, value: 'https://en.wikipedia.org' },
        { condition: true, value: 'https://en.vikidia.org' },
        { condition: true, value: 'https://en.wikimedia.org' },
      ]

      const url = basicURLDirector.buildDownloaderBaseUrl(conditions)

      expect(url).toBe('https://en.vikidia.org')
    })

    it('should return the last value because its condition is true and first ones is false', () => {
      const conditions = [
        { condition: false, value: 'https://en.wikipedia.org' },
        { condition: false, value: 'https://en.vikidia.org' },
        { condition: true, value: 'https://en.wikimedia.org' },
      ]

      const url = basicURLDirector.buildDownloaderBaseUrl(conditions)

      expect(url).toBe('https://en.wikimedia.org')
    })

    it('should return undefined if all conditions are false', () => {
      const conditions = [
        { condition: false, value: 'https://en.wikipedia.org' },
        { condition: false, value: 'https://en.vikidia.org' },
        { condition: false, value: 'https://en.wikimedia.org' },
      ]

      const url = basicURLDirector.buildDownloaderBaseUrl(conditions)

      expect(url).toBe(undefined)
    })
  })
})
