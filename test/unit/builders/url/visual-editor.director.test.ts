import VisualEditorURLDirector from '../../../../src/util/builders/url/visual-editor.director.js'

describe('VisualEditorURLDirector', () => {
  const visualEditorUrlDirector = new VisualEditorURLDirector('https://en.m.wikipedia.org/?action=visualeditor&mobileformat=html&format=json&paction=parse')

  describe('buildArticleURL', () => {
    it('should build a URL object with query params to get article', () => {
      const url = visualEditorUrlDirector.buildArticleURL('article-123')

      expect(url).toBe('https://en.m.wikipedia.org/?action=visualeditor&mobileformat=html&format=json&paction=parse&page=article-123')
    })
  })
})
