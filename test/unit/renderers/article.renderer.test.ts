import domino from 'domino'
import { jest } from '@jest/globals'
import { DELETED_ARTICLE_ERROR } from '../../../src/util/const.js'
import { VisualEditorRenderer } from '../../../src/util/renderers/visual-editor.renderer.js'
import { setupScrapeClasses } from '../../util.js'
import { redisStore } from '../bootstrap.js'
import { RenderOpts } from 'src/util/renderers/abstract.renderer.js'

jest.setTimeout(10000)

describe('ArticleRenderer', () => {
  describe('test Visual Editor renderer', () => {
    const prepareFixtures = (json: Record<string, any> | null) => {
      return {
        data: json,
        articleId: '123',
        articleDetail: { title: 'Eminem and D12', timestamp: '2023-08-24T02:19:04Z' },
        isMainPage: false,
      }
    }
    const visualEditorRenderer = new VisualEditorRenderer()

    it('should throw if no JSON was provided', async () => {
      expect(async () => {
        await visualEditorRenderer.render({
          data: null,
        } as RenderOpts)
      }).rejects.toThrow(new Error('Cannot render [null] into an article'))
    })

    it('should throw if article has been deleted between fetching list and downloading content', () => {
      const { data, articleId } = prepareFixtures({ visualeditor: { oldid: 0 } })

      expect(async () => {
        await visualEditorRenderer.render({ data, articleId } as RenderOpts)
      }).rejects.toThrow(new Error(DELETED_ARTICLE_ERROR))
    })

    it('should return visualeditor content if the main page flag is true', async () => {
      const { downloader, dump } = await setupScrapeClasses({ format: '' })
      const { data, articleId, articleDetail } = prepareFixtures({ visualeditor: { content: 'Lorem ipsum dolor sit amet' } })
      const _moduleDependencies = await downloader.getModuleDependencies(articleId)
      const result = await visualEditorRenderer.render({
        data,
        redisStore,
        webp: downloader.webp,
        _moduleDependencies,
        articleId,
        articleDetail,
        isMainPage: true,
        dump,
      } as RenderOpts)

      const doc = domino.createDocument(result[0].html)
      const content = doc.getElementById('mw-content-text').firstChild.textContent

      expect(content).toBe(data.visualeditor.content)
    })

    it('should inject header to the visual editor content if the main page flag is false', async () => {
      const { downloader, dump } = await setupScrapeClasses({ format: '' })
      const content = '<body class="mw-body-content">consectetur adipiscing elit</body>'
      const { data, articleId } = prepareFixtures({ visualeditor: { content } })
      const _moduleDependencies = await downloader.getModuleDependencies(articleId)
      const result = await visualEditorRenderer.render({
        data,
        redisStore,
        webp: downloader.webp,
        _moduleDependencies,
        articleId,
        articleDetail: { title: 'consectetur adipiscing elit', timestamp: '2023-08-24T02:19:04Z' },
        isMainPage: false,
        dump,
      } as RenderOpts)

      const hasTitle = domino.createDocument(result[0].html).querySelector('h1')
      expect(hasTitle).toBeTruthy()
    })

    it('should return html body if json contentmodel param is `wikitext`', async () => {
      const { downloader, dump } = await setupScrapeClasses({ format: '' })
      const htmlBody = '<body>sed do eiusmod tempor incididunt</body>'
      const { data, articleId, articleDetail } = prepareFixtures({ html: { body: htmlBody }, contentmodel: 'wikitext' })
      const _moduleDependencies = await downloader.getModuleDependencies(articleId)
      const result = await visualEditorRenderer.render({
        data,
        redisStore,
        webp: downloader.webp,
        _moduleDependencies,
        articleId,
        articleDetail,
        isMainPage: false,
        dump,
      } as RenderOpts)

      const doc = domino.createDocument(result[0].html)
      const content = doc.querySelector('body')

      expect(content).toBeTruthy()
    })

    it('should return html body if it`s presented even if contentmodel param is not equal to wikitext', async () => {
      const { downloader, dump } = await setupScrapeClasses({ format: '' })
      const htmlBody = '<body>ut labore et dolore magna aliqua. Ut enim ad minim veniam</body>'
      const { data, articleId, articleDetail } = prepareFixtures({ html: { body: htmlBody } })
      const _moduleDependencies = await downloader.getModuleDependencies(articleId)
      const result = await visualEditorRenderer.render({
        data,
        redisStore,
        webp: downloader.webp,
        _moduleDependencies,
        articleId,
        articleDetail,
        isMainPage: false,
        dump,
      } as RenderOpts)

      const doc = domino.createDocument(result[0].html)
      const content = doc.querySelector('body')

      expect(content).toBeTruthy()
    })

    it('should return empty string if there was an error during article retrievement', async () => {
      const { downloader, dump } = await setupScrapeClasses({ format: '' })
      const { data, articleId, articleDetail } = prepareFixtures({ error: 'Unexpected internal error' })
      const _moduleDependencies = await downloader.getModuleDependencies(articleId)
      const result = await visualEditorRenderer.render({
        data,
        redisStore,
        webp: downloader.webp,
        _moduleDependencies,
        articleId,
        articleDetail,
        isMainPage: false,
        dump,
      } as RenderOpts)

      expect(result).toBe('')
    })
  })
})
