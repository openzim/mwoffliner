import { jest } from '@jest/globals'
import { DELETED_ARTICLE_ERROR } from '../../../src/util/const.js'
import { VisualEditorRenderer } from '../../../src/util/renderers/visual-editor.renderer.js'

jest.setTimeout(10000)

describe('ArticleRenderer', () => {
  describe('test Visual Editor renderer', () => {
    const prepareFixtures = (json: Record<string, any> | null) => {
      return {
        data: json,
        articleId: '123',
        articleDetail: { title: 'Eminem and D12' },
        isMainPage: false,
      }
    }
    const visualEditorRenderer = new VisualEditorRenderer()

    it('should throw if no JSON was provided', async () => {
      const renderOpts = {
        data: null,
      }

      expect(async () => {
        await visualEditorRenderer.render(renderOpts)
      }).rejects.toThrow(new Error('Cannot render [null] into an article'))
    })

    it('should throw if article has been deleted between fetching list and downloading content', () => {
      const { data, articleId } = prepareFixtures({ visualeditor: { oldid: 0 } })

      expect(async () => {
        await visualEditorRenderer.render({ data, articleId })
      }).rejects.toThrow(new Error(DELETED_ARTICLE_ERROR))
    })

    it('should return visualeditor content if the main page flag is true', async () => {
      const { data, articleId, articleDetail } = prepareFixtures({ visualeditor: { content: 'Lorem ipsum dolor sit amet' } })
      const result = await visualEditorRenderer.render({ data, articleId, articleDetail, isMainPage: true })

      expect(result[0].html).toBe(data.visualeditor.content)
    })

    it('should inject header to the visual editor content if the main page flag is false', async () => {
      const content = '<body class="mw-body-content">consectetur adipiscing elit</body>'
      const contentWithHeader = '<html><head></head><body class="mw-body-content"><h1 class="article-header"></h1>consectetur adipiscing elit</body></html>'
      const { data, articleId } = prepareFixtures({ visualeditor: { content } })

      jest.spyOn(new VisualEditorRenderer() as any, 'injectHeader').mockReturnValue(contentWithHeader)

      const result = await visualEditorRenderer.render({ data, articleId, articleDetail: 'consectetur adipiscing elit' })

      expect(result[0].html).toBe(contentWithHeader)
    })

    it('should return html body if json contentmodel param is `wikitext`', async () => {
      const htmlBody = '<body>sed do eiusmod tempor incididunt</body>'
      const { data, articleId } = prepareFixtures({ html: { body: htmlBody }, contentmodel: 'wikitext' })
      const result = await visualEditorRenderer.render({ data, articleId })

      expect(result[0].html).toBe(htmlBody)
    })

    it('should return html body if it`s presented even if contentmodel param is not equal to wikitext', async () => {
      const htmlBody = '<body>ut labore et dolore magna aliqua. Ut enim ad minim veniam</body>'
      const { data, articleId } = prepareFixtures({ html: { body: htmlBody } })
      const result = await visualEditorRenderer.render({ data, articleId })

      expect(result[0].html).toBe(htmlBody)
    })

    it('should return empty string if there was an error during article retrievement', async () => {
      const { data, articleId } = prepareFixtures({ error: 'Unexpected internal error' })
      const result = await visualEditorRenderer.render({ data, articleId })

      expect(result).toBe('')
    })
  })
})
