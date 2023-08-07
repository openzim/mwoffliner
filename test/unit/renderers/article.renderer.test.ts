import { jest } from '@jest/globals'
import { DELETED_ARTICLE_ERROR } from '../../../src/util/const.js'
import articleRenderer, { ArticleRenderer } from '../../../src/util/renderers/article.renderer.js'

describe('ArticleRenderer', () => {
  describe('render Parsoid HTML', () => {
    const prepareFixtures = (json: Record<string, any> | null) => {
      return {
        articleDetails: { title: 'Eminem and D12' },
        articleId: '123',
        json,
      }
    }

    it('should throw if no JSON was provided', () => {
      const { json, articleDetails, articleId } = prepareFixtures(null)

      expect(() => articleRenderer.renderArticle(json, articleId, articleDetails)).toThrow(new Error('Cannot render [null] into an article'))
    })

    it('should throw if article has been deleted between fetching list and downloading content', () => {
      const { json, articleDetails, articleId } = prepareFixtures({ visualeditor: { oldid: 0 } })

      expect(() => articleRenderer.renderArticle(json, articleId, articleDetails)).toThrow(new Error(DELETED_ARTICLE_ERROR))
    })

    it('should return visualeditor content if the main page flag is true', () => {
      const { json, articleDetails, articleId } = prepareFixtures({ visualeditor: { content: 'Lorem ipsum dolor sit amet' } })

      const result = articleRenderer.renderArticle(json, articleId, articleDetails, true)

      expect(result).toBe(json.visualeditor.content)
    })

    it('should inject header to the visual editor content if the main page flag is false', () => {
      const content = '<body class="my-body-content">consectetur adipiscing elit</body>'
      const contentWithHeader = '<body class="my-body-content"><h1 class="article-header"></h1>consectetur adipiscing elit</body>'

      const { json, articleDetails, articleId } = prepareFixtures({ visualeditor: { content } })

      jest.spyOn(ArticleRenderer.prototype as any, 'injectHeader').mockReturnValue(contentWithHeader)

      const result = articleRenderer.renderArticle(json, articleId, articleDetails)

      expect(result).toBe(contentWithHeader)
    })

    it('should return html body if json contentmodel param is `wikitext`', () => {
      const htmlBody = '<body>sed do eiusmod tempor incididunt</body>'

      const { json, articleDetails, articleId } = prepareFixtures({ html: { body: htmlBody }, contentmodel: 'wikitext' })

      const result = articleRenderer.renderArticle(json, articleId, articleDetails)

      expect(result).toBe(htmlBody)
    })

    it('should return html body if it`s presented even if contentmodel param is not equal to wikitext', () => {
      const htmlBody = '<body>ut labore et dolore magna aliqua. Ut enim ad minim veniam</body>'

      const { json, articleDetails, articleId } = prepareFixtures({ html: { body: htmlBody } })

      const result = articleRenderer.renderArticle(json, articleId, articleDetails)

      expect(result).toBe(htmlBody)
    })

    it('should return empty string if there was an error during article retrievement', () => {
      const { json, articleDetails, articleId } = prepareFixtures({ error: 'Unexpected internal error' })

      const result = articleRenderer.renderArticle(json, articleId, articleDetails)

      expect(result).toBe('')
    })

    it.only('should return json as it is by default', () => {
      const { json, articleDetails, articleId } = prepareFixtures({ api: { path: 'https://random.path.org' } })

      const result = articleRenderer.renderArticle(json, articleId, articleDetails)

      expect(result).toEqual(json)
    })
  })
})
