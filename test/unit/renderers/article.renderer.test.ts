import { jest } from '@jest/globals'
import Downloader, { DownloadError } from '../../../src/Downloader.js'
import { ActionParseRenderer } from '../../../src/renderers/action-parse.renderer.js'
import MediaWiki from '../../../src/MediaWiki.js'
import { config } from '../../../src/config.js'

jest.setTimeout(10000)

describe('ArticleRenderer', () => {
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

    it('regular page has content', async () => {
      const articleId = '荷蘭Floriade世界園藝博覽會'
      const downloadRes = await actionParseRenderer.download({ articleId, articleUrl: Downloader.getArticleUrl(articleId), articleDetail: { title: 'foo' } })
      expect(downloadRes.data).toBeDefined()
    })

    it('moved page has content retrieved from fallback logic', async () => {
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
