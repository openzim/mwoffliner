import visualEditorURLDirector from '../../../../src/util/builders/url/visual-editor.director.js'

describe('VisualEditorURLDirector', () => {
  describe('buildURL', () => {
    it('should build a URL object with basic query params', () => {
      const url = visualEditorURLDirector.buildURL('https://en.m.wikipedia.org/')

      expect(url.href).toBe('https://en.m.wikipedia.org/?action=visualeditor&mobileformat=html&format=json&paction=parse')
    })
  })

  describe('buildArticleURL', () => {
    it('should build a URL object with query params to get article', () => {
      const url = visualEditorURLDirector.buildArticleURL('https://en.m.wikipedia.org/?action=visualeditor&mobileformat=html&format=json&paction=parse', 'article-123')

      expect(url).toBe('https://en.m.wikipedia.org/?action=visualeditor&mobileformat=html&format=json&paction=parse&page=article-123')
    })
  })
})
