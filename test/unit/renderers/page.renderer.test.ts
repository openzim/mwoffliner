import { jest } from '@jest/globals'
import Downloader, { DownloadError } from '../../../src/Downloader.js'
import { ActionParseRenderer } from '../../../src/renderers/action-parse.renderer.js'
import MediaWiki from '../../../src/MediaWiki.js'
import { config } from '../../../src/config.js'

jest.setTimeout(10000)

describe('Renderers', () => {
  describe('test ActionParse renderer', () => {
    const actionParseRenderer = new ActionParseRenderer()

    beforeAll(async () => {
      MediaWiki.base = 'https://zh.wikipedia.org'
      Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, workers: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }
      await MediaWiki.getMwMetaData()
      await MediaWiki.hasActionParseApi()
      Downloader.setUrlsDirectors(actionParseRenderer)
    })

    it('regular page has content', async () => {
      const pageTitle = '荷蘭Floriade世界園藝博覽會' as PageTitle
      const downloadRes = await actionParseRenderer.download({ pageTitle: pageTitle, pageUrl: Downloader.getPageUrl(pageTitle), pageDetail: { title: 'foo' as PageTitle } })
      expect(downloadRes.data).toBeDefined()
    })

    it('moved page has content retrieved from fallback logic', async () => {
      const pageTitle = '荷兰Floriade世界園藝博覽會' as PageTitle
      const downloadRes = await actionParseRenderer.download({ pageTitle: pageTitle, pageUrl: Downloader.getPageUrl(pageTitle), pageDetail: { title: 'foo' as PageTitle } })
      expect(downloadRes.data).toBeDefined()
    })

    it('missing page throws a download error', async () => {
      const pageTitle = 'foo-foo-foo' as PageTitle
      expect(actionParseRenderer.download({ pageTitle: pageTitle, pageUrl: Downloader.getPageUrl(pageTitle), pageDetail: { title: 'foo' as PageTitle } })).rejects.toThrow(
        DownloadError,
      )
    })
  })
})
