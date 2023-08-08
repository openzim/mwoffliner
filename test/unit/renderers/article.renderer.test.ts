import { jest } from '@jest/globals'
import { DELETED_ARTICLE_ERROR } from '../../../src/util/const.js'
/* import { Dump } from '../../../src/Dump.js'
import { config } from '../../../src/config.js'
import Downloader from '../../../src/Downloader.js'
import MediaWiki from '../../../src/MediaWiki.js'*/
import articleRenderer, { ArticleRenderer } from '../../../src/util/renderers/article.renderer.js'

jest.setTimeout(10000)

describe('ArticleRenderer', () => {
  describe('test Visual Editor renderer', () => {
    const prepareFixtures = (json: Record<string, any> | null) => {
      return {
        articleDetails: { title: 'Eminem and D12' },
        articleId: '123',
        json,
      }
    }

    const mwCapabilities = {
      apiAvailable: true,
      veApiAvailable: true,
      coordinatesAvailable: true,
      desktopRestApiAvailable: false,
    }

    it('should throw if no JSON was provided', () => {
      const { json, articleId } = prepareFixtures(null)

      expect(async () => await articleRenderer.renderArticle(json, articleId, mwCapabilities)).toThrow(new Error('Cannot render [null] into an article'))
    })

    it('should throw if article has been deleted between fetching list and downloading content', () => {
      const { json, articleId } = prepareFixtures({ visualeditor: { oldid: 0 } })

      expect(async () => await articleRenderer.renderArticle(json, articleId, mwCapabilities)).toThrow(new Error(DELETED_ARTICLE_ERROR))
    })

    it('should return visualeditor content if the main page flag is true', async () => {
      const { json, articleId } = prepareFixtures({ visualeditor: { content: 'Lorem ipsum dolor sit amet' } })
      const result = await articleRenderer.renderArticle(json, articleId, mwCapabilities)

      expect(result).toBe(json.visualeditor.content)
    })

    it('should inject header to the visual editor content if the main page flag is false', async () => {
      const content = '<body class="my-body-content">consectetur adipiscing elit</body>'
      const contentWithHeader = '<body class="my-body-content"><h1 class="article-header"></h1>consectetur adipiscing elit</body>'
      const { json, articleId } = prepareFixtures({ visualeditor: { content } })

      jest.spyOn(ArticleRenderer.prototype as any, 'injectHeader').mockReturnValue(contentWithHeader)

      const result = await articleRenderer.renderArticle(json, articleId, mwCapabilities)

      expect(result).toBe(contentWithHeader)
    })

    it('should return html body if json contentmodel param is `wikitext`', async () => {
      const htmlBody = '<body>sed do eiusmod tempor incididunt</body>'
      const { json, articleId } = prepareFixtures({ html: { body: htmlBody }, contentmodel: 'wikitext' })
      const result = await articleRenderer.renderArticle(json, articleId, mwCapabilities)

      expect(result).toBe(htmlBody)
    })

    it('should return html body if it`s presented even if contentmodel param is not equal to wikitext', async () => {
      const htmlBody = '<body>ut labore et dolore magna aliqua. Ut enim ad minim veniam</body>'
      const { json, articleId } = prepareFixtures({ html: { body: htmlBody } })
      const result = await articleRenderer.renderArticle(json, articleId, mwCapabilities)

      expect(result).toBe(htmlBody)
    })

    it('should return empty string if there was an error during article retrievement', async () => {
      const { json, articleId } = prepareFixtures({ error: 'Unexpected internal error' })
      const result = await articleRenderer.renderArticle(json, articleId, mwCapabilities)

      expect(result).toBe('')
    })

    it.only('should return json as it is by default', async () => {
      const { json, articleId } = prepareFixtures({ api: { path: 'https://random.path.org' } })
      const result = await articleRenderer.renderArticle(json, articleId, mwCapabilities)

      expect(result).toEqual(json)
    })
  })
})
