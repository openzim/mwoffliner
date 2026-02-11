import ApiURLDirector from '../../../../src/util/builders/url/api.director.js'

describe('ApiURLDirector', () => {
  const apiUrlDirector = new ApiURLDirector('https://en.wikipedia.org/w/api.php')

  describe('buildQueryURL', () => {
    it('should build a string URL with provided query params', () => {
      const url = apiUrlDirector.buildQueryURL({ param1: 'param1', param2: 'param2' })

      expect(url).toBe('https://en.wikipedia.org/w/api.php?param1=param1&param2=param2')
    })
  })

  describe('buildSiteInfoURL', () => {
    it('should return a string URL with predefined query params for retrieving site info', () => {
      const url = apiUrlDirector.buildSiteInfoURL()

      expect(url).toBe(
        'https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo%7Callmessages&siprop=general%7Cskins%7Crightsinfo%7Cnamespaces%7Cnamespacealiases&ammessages=tagline&amenableparser=1&list=gadgets&gaprop=id%7Cmetadata&gaallowedonly=1&gaenabledonly=1&format=json&formatversion=2&maxlag=5',
      )
    })
  })
})
