import { ZimArticle } from '@openzim/libzim'
import domino from 'domino'
import { mwRetToArticleDetail } from '../../../src/util/mw-api.js'
import { setupScrapeClasses } from '../../util.js'
import { redisStore, startRedis, stopRedis } from '../bootstrap.js'
import { saveArticles } from '../../../src/util/saveArticles.js'
import { jest } from '@jest/globals'
import { getArticleUrl } from '../../../src/util/saveArticles.js'
import { RendererBuilder } from '../../../src/util/renderers/renderer.builder.js'

jest.setTimeout(10000)

describe('ArticleTreatment', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  test('Article html processing', async () => {
    const { downloader, mw, dump } = await setupScrapeClasses() // en wikipedia
    await downloader.setBaseUrls()
    const _articlesDetail = await downloader.getArticleDetailsIds(['London'])
    const articlesDetail = mwRetToArticleDetail(_articlesDetail)
    const { articleDetailXId } = redisStore
    await articleDetailXId.flush()
    await articleDetailXId.setMany(articlesDetail)

    const addedArticles: (typeof ZimArticle)[] = []

    const desktopRenderer = new RendererBuilder('desktop')
    const articleId = 'non-existent-article'
    const articleUrl = getArticleUrl(downloader, dump, articleId)

    // TODO: use proper spied (like sinon.js)
    await saveArticles(
      {
        addArticle(article: typeof ZimArticle) {
          if (article.mimeType === 'text/html') {
            addedArticles.push(article)
          }
          return Promise.resolve(null)
        },
      } as any,
      downloader,
      redisStore,
      mw,
      dump,
    )

    // Successfully scrapped existent articles
    expect(addedArticles).toHaveLength(1)
    expect(addedArticles[0].aid).toEqual('A/London')

    await expect(downloader.getArticle(articleId, articleDetailXId, desktopRenderer, articleUrl)).rejects.toThrowError('')

    const articleDoc = domino.createDocument(addedArticles.shift().bufferData.toString())

    // Successfully scrapped existent articles
    expect(articleDoc.querySelector('meta[name="geo.position"]')).toBeDefined()
    // Geo Position data is correct
    expect(articleDoc.querySelector('meta[name="geo.position"]')?.getAttribute('content')).toEqual('51.50722222;-0.1275')
  })
})
