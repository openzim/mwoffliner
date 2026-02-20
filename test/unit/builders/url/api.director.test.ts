import ApiURLDirector from '../../../../src/util/builders/url/api.director.js'

describe('ApiURLDirector', () => {
  const apiUrlDirector = new ApiURLDirector('https://en.wikipedia.org/w/api.php')

  describe('buildQueryURL', () => {
    it('should build a string URL with provided query params', () => {
      const url = apiUrlDirector.buildQueryURL({ param1: 'param1', param2: 'param2' })

      expect(url).toBe('https://en.wikipedia.org/w/api.php?param1=param1&param2=param2')
    })
  })

  describe('buildArticleApiURL', () => {
    it('should return a string URL with predefined query params and provided page for retrieving article', () => {
      const url = apiUrlDirector.buildArticleApiURL('article-123')

      expect(url).toBe('https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=modules%7Cjsconfigvars%7Cheadhtml&formatversion=2&page=article-123&maxlag=5')
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

  describe('buildVisualEditorURL', () => {
    it('should return base visual editor URL object with default query params', () => {
      const url = apiUrlDirector.buildVisualEditorURL()

      expect(url.href).toBe('https://en.wikipedia.org/w/api.php?action=visualeditor&mobileformat=html&format=json&paction=parse&formatversion=2')
    })
  })
})
