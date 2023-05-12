import restURLDirector from '../../../../src/util/builders/url/rest.director.js'

describe('RestURLDirector', () => {
  describe('buildURL', () => {
    it('should return rest URL with provided path and trailing char at the end', () => {
      const url = restURLDirector.buildURL('https://en.m.wikipedia.org/', 'api/rest_v2')

      expect(url.href).toBe('https://en.m.wikipedia.org/api/rest_v2/')
    })

    it('should return rest URL with default path and trailing char at the end', () => {
      const url = restURLDirector.buildURL('https://en.m.wikipedia.org/')

      expect(url.href).toBe('https://en.m.wikipedia.org/api/rest_v1/')
    })
  })
})
