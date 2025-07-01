import domino from 'domino'
import { jest } from '@jest/globals'
import { DELETED_ARTICLE_ERROR } from '../../../src/util/const.js'
import { VisualEditorRenderer } from '../../../src/renderers/visual-editor.renderer.js'
import { setupScrapeClasses } from '../../util.js'
import { RenderOpts } from 'src/renderers/abstract.renderer.js'
import Downloader, { DownloadError } from '../../../src/Downloader.js'
import { ActionParseRenderer } from '../../../src/renderers/action-parse.renderer.js'
import MediaWiki from '../../../src/MediaWiki.js'
import { config } from '../../../src/config.js'

jest.setTimeout(10000)

describe('ArticleRenderer', () => {
  describe('test Visual Editor renderer', () => {
    const prepareFixtures = (json: Record<string, any> | null) => {
      MediaWiki.metaData.mainPage = '456'
      return {
        data: json,
        articleId: '123',
        articleDetail: { title: 'Brian May', timestamp: '2023-08-24T02:19:04Z' },
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
      const { dump } = await setupScrapeClasses()
      const { data, articleId, articleDetail } = prepareFixtures({ visualeditor: { content: 'Lorem ipsum dolor sit amet' } })
      const moduleDependencies = await Downloader.getModuleDependencies(articleDetail.title)
      MediaWiki.metaData.mainPage = articleId
      const result = await visualEditorRenderer.render({
        data,
        webp: Downloader.webp,
        moduleDependencies,
        articleId,
        articleDetail,
        dump,
      } as RenderOpts)

      const doc = domino.createDocument(result[0].html)
      const content = doc.getElementById('mw-content-text').firstChild.textContent

      expect(content).toBe(data.visualeditor.content)
    })

    it('should inject header to the visual editor content if the main page flag is false', async () => {
      const { dump } = await setupScrapeClasses()
      const content = '<body class="mw-body-content">consectetur adipiscing elit</body>'
      const { data, articleId, articleDetail } = prepareFixtures({ visualeditor: { content } })
      const moduleDependencies = await Downloader.getModuleDependencies(articleDetail.title)
      const result = await visualEditorRenderer.render({
        data,
        webp: Downloader.webp,
        moduleDependencies,
        articleId,
        articleDetail: { title: 'consectetur adipiscing elit', timestamp: '2023-08-24T02:19:04Z' },
        dump,
      } as RenderOpts)

      const hasTitle = domino.createDocument(result[0].html).querySelector('h1')
      expect(hasTitle).toBeTruthy()
    })

    it('should return html body if json contentmodel param is `wikitext`', async () => {
      const { dump } = await setupScrapeClasses()
      const htmlBody = '<body>sed do eiusmod tempor incididunt</body>'
      const { data, articleId, articleDetail } = prepareFixtures({ html: { body: htmlBody }, contentmodel: 'wikitext' })
      const moduleDependencies = await Downloader.getModuleDependencies(articleDetail.title)
      const result = await visualEditorRenderer.render({
        data,
        webp: Downloader.webp,
        moduleDependencies,
        articleId,
        articleDetail,
        dump,
      } as RenderOpts)

      const doc = domino.createDocument(result[0].html)
      const content = doc.querySelector('body')

      expect(content).toBeTruthy()
    })

    it('should return html body if it`s presented even if contentmodel param is not equal to wikitext', async () => {
      const { dump } = await setupScrapeClasses()
      const htmlBody = '<body>ut labore et dolore magna aliqua. Ut enim ad minim veniam</body>'
      const { data, articleId, articleDetail } = prepareFixtures({ html: { body: htmlBody } })
      const moduleDependencies = await Downloader.getModuleDependencies(articleDetail.title)
      const result = await visualEditorRenderer.render({
        data,
        webp: Downloader.webp,
        moduleDependencies,
        articleId,
        articleDetail,
        dump,
      } as RenderOpts)

      const doc = domino.createDocument(result[0].html)
      const content = doc.querySelector('body')

      expect(content).toBeTruthy()
    })

    it('should return empty string if there was an error during article retrievement', async () => {
      const { dump } = await setupScrapeClasses()
      const { data, articleId, articleDetail } = prepareFixtures({ error: 'Unexpected internal error' })
      const moduleDependencies = await Downloader.getModuleDependencies(articleDetail.title)
      const result = await visualEditorRenderer.render({
        data,
        webp: Downloader.webp,
        moduleDependencies,
        articleId,
        articleDetail,
        dump,
      } as RenderOpts)

      expect(result).toBe('')
    })
  })

  describe('test ActionParse renderer', () => {
    const actionParseRenderer = new ActionParseRenderer()

    beforeAll(async () => {
      MediaWiki.base = 'https://zh.wikipedia.org'
      MediaWiki.getCategories = true
      Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }
      await MediaWiki.getMwMetaData()
      await MediaWiki.hasActionParseApi()
      Downloader.setUrlsDirectors(actionParseRenderer, actionParseRenderer)
    })

    it('regular paged has content', async () => {
      const articleId = '荷蘭Floriade世界園藝博覽會'
      const downloadRes = await actionParseRenderer.download({ articleId, articleUrl: Downloader.getArticleUrl(articleId), articleDetail: { title: 'foo' } })
      expect(downloadRes.data).toBeDefined()
    })

    it('moved paged has content retrieved from fallback logic', async () => {
      const articleId = '荷兰Floriade世界園藝博覽會'
      const downloadRes = await actionParseRenderer.download({ articleId, articleUrl: Downloader.getArticleUrl(articleId), articleDetail: { title: 'foo' } })
      expect(downloadRes.data).toBeDefined()
    })

    it('missing page throws a download error', async () => {
      const articleId = 'foo-foo-foo'
      expect(actionParseRenderer.download({ articleId, articleUrl: Downloader.getArticleUrl(articleId), articleDetail: { title: 'foo' } })).rejects.toThrow(DownloadError)
    })
  })
})
