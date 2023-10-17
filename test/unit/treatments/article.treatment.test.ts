import domino from 'domino'
import RedisStore from '../../../src/RedisStore.js'
import { ZimArticle } from '@openzim/libzim'
import { mwRetToArticleDetail } from '../../../src/util/mw-api.js'
import { setupScrapeClasses } from '../../util.js'
import { startRedis, stopRedis } from '../bootstrap.js'
import { saveArticles } from '../../../src/util/saveArticles.js'
import { jest } from '@jest/globals'
import { getArticleUrl } from '../../../src/util/saveArticles.js'
import { WikimediaDesktopRenderer } from '../../../src/renderers/wikimedia-desktop.renderer.js'

jest.setTimeout(10000)

describe('ArticleTreatment', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  test('Article html processing', async () => {
    const { downloader, dump } = await setupScrapeClasses() // en wikipedia
    await downloader.setBaseUrls()
    const title = 'London'
    const _articlesDetail = await downloader.getArticleDetailsIds([title])
    const articlesDetail = mwRetToArticleDetail(_articlesDetail)
    const { articleDetailXId } = RedisStore
    await articleDetailXId.flush()
    await articleDetailXId.setMany(articlesDetail)

    const addedArticles: (typeof ZimArticle)[] = []

    const wikimediaDesktopRenderer = new WikimediaDesktopRenderer()
    const articleId = 'non-existent-article'
    const articleUrl = getArticleUrl(downloader, dump, articleId)

    const _moduleDependencies = await downloader.getModuleDependencies(title)
    const articleDetail = {
      title,
      thumbnail: {
        width: 50,
        height: 28,
        source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/50px-London_Skyline_%28125508655%29.jpeg',
      },
      revisionId: 1171340841,
      timestamp: '2023-08-20T14:54:01Z',
      coordinates: '51.50722222;-0.1275',
    }

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
      dump,
      true,
    )

    // Successfully scrapped existent articles
    expect(addedArticles).toHaveLength(1)
    expect(addedArticles[0].aid).toEqual('A/London')

    await expect(
      downloader.getArticle(
        downloader.webp,
        _moduleDependencies,
        articleId,
        articleDetailXId,
        wikimediaDesktopRenderer,
        articleUrl,
        dump,
        articleDetail,
        dump.isMainPage(articleId),
      ),
    ).rejects.toThrowError('')

    const articleDoc = domino.createDocument(addedArticles.shift().bufferData.toString())

    // Successfully scrapped existent articles
    expect(articleDoc.querySelector('meta[name="geo.position"]')).toBeDefined()
    // Geo Position data is correct
    expect(articleDoc.querySelector('meta[name="geo.position"]')?.getAttribute('content')).toEqual('51.50722222;-0.1275')
  })
})
