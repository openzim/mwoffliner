import domino from 'domino'
import RedisStore from '../../../src/RedisStore.js'
import { StringItem } from '@openzim/libzim'
import { mwRetToArticleDetail } from '../../../src/util/mw-api.js'
import { setupScrapeClasses } from '../../util.js'
import { startRedis, stopRedis } from '../bootstrap.js'
import { saveArticles } from '../../../src/util/saveArticles.js'
import { jest } from '@jest/globals'
import { RENDERERS_LIST } from '../../../src/util/const.js'
import Downloader from '../../../src/Downloader.js'
import RenderingContext from '../../../src/renderers/rendering.context.js'
import { renderName } from 'src/renderers/abstract.renderer.js'

jest.setTimeout(10000)

describe('ArticleTreatment', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  for (const renderer of RENDERERS_LIST) {
    test(`Article html processing for ${renderer} render`, async () => {
      const { dump } = await setupScrapeClasses() // en wikipedia
      await RenderingContext.createRenderers(renderer as renderName, true)
      const _articlesDetail = await Downloader.getArticleDetailsIds(['London', 'non-existent-article'])
      const articlesDetail = mwRetToArticleDetail(_articlesDetail)
      const { articleDetailXId } = RedisStore
      await articleDetailXId.flush()
      await articleDetailXId.setMany(articlesDetail)

      const addedArticles: StringItem[] = []

      // TODO: use proper spied (like sinon.js)
      await saveArticles(
        {
          addItem(article: StringItem) {
            if (article.mimeType === 'text/html') {
              addedArticles.push(article)
            }
            return Promise.resolve(null)
          },
        } as any,
        dump,
      )

      // Successfully scrapped existent articles + placeholder for deleted article
      expect(addedArticles).toHaveLength(2)

      expect([addedArticles[0].title, addedArticles[1].title]).toEqual(expect.arrayContaining(['London', 'non-existent-article']))

      for (let i = 0; i <= 1; i++) {
        if (addedArticles[i].title === 'London') {
          const articleDoc = domino.createDocument(addedArticles[i].getContentProvider().feed().toString())

          // Successfully scrapped existent articles
          expect(articleDoc.querySelector('meta[name="geo.position"]')).toBeDefined()
          // Geo Position data is correct
          expect(articleDoc.querySelector('meta[name="geo.position"]')?.getAttribute('content')).toEqual('51.50722222;-0.1275')
        }

        if (addedArticles[i].title === 'non-existent-article') {
          expect(addedArticles[i].getContentProvider().feed().toString()).toContain('Oops. Article not found.')
        }
      }
    })
  }
})
