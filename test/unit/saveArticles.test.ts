import domino from 'domino'

import RedisStore from '../../src/RedisStore.js'
import { startRedis, stopRedis } from './bootstrap.js'
import { setupScrapeClasses } from '../util.js'
import { saveArticles } from '../../src/util/saveArticles.js'
import { StringItem } from '@openzim/libzim'
import { mwRetToArticleDetail } from '../../src/util/index.js'
import { jest } from '@jest/globals'
import { RENDERERS_LIST } from '../../src/util/const.js'
import { renderName } from 'src/renderers/abstract.renderer.js'
import Downloader from '../../src/Downloader.js'
import RenderingContext from '../../src/renderers/rendering.context.js'

jest.setTimeout(40000)

describe('saveArticles', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  for (const renderer of RENDERERS_LIST) {
    test(`Article html processing using ${renderer} renderer`, async () => {
      const { dump } = await setupScrapeClasses() // en wikipedia
      await RenderingContext.createRenderers(renderer as renderName, true)

      const _articlesDetail = await Downloader.getArticleDetailsIds(['London'])
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

      // Successfully scrapped existent articles
      expect(addedArticles).toHaveLength(1)
      expect(addedArticles[0].title).toEqual('London')

      const articleDoc = domino.createDocument(addedArticles.shift().getContentProvider().feed().toString())

      // Successfully scrapped existent articles
      expect(articleDoc.querySelector('meta[name="geo.position"]')).toBeDefined()
      // Geo Position data is correct
      expect(articleDoc.querySelector('meta[name="geo.position"]')?.getAttribute('content')).toEqual('51.50722222;-0.1275')
      // Check if header exists
      expect(articleDoc.querySelector('h1#firstHeading, h1.article-header, h1.pcs-edit-section-title')).toBeTruthy()
    })

    test(`Check nodet article for en.wikipedia.org using ${renderer} renderer`, async () => {
      const { dump } = await setupScrapeClasses({ mwUrl: 'https://en.wikipedia.org', format: 'nodet' }) // en wikipedia
      await RenderingContext.createRenderers(renderer as renderName, true)
      const articleId = 'Canada'
      const articleUrl = Downloader.getArticleUrl(articleId, { sectionId: '0' })
      const _articleDetailsRet = await Downloader.getArticleDetailsIds([articleId])
      const articlesDetail = mwRetToArticleDetail(_articleDetailsRet)
      const { articleDetailXId } = RedisStore
      const articleDetail = { title: articleId, timestamp: '2023-09-10T17:36:04Z' }
      articleDetailXId.setMany(articlesDetail)
      const result = await Downloader.getArticle(articleId, articleDetailXId, RenderingContext.articlesRenderer, articleUrl, dump, articleDetail)

      const articleDoc = domino.createDocument(result[0].html)

      const headings = Array.from(articleDoc.querySelectorAll('.mw-heading'))
      const infoboxes = Array.from(articleDoc.querySelectorAll('table.infobox'))
      const paragraphs = Array.from(articleDoc.querySelectorAll('p'))

      expect(headings).toHaveLength(0)
      expect(infoboxes).toHaveLength(1)
      expect(paragraphs.length).toBeGreaterThan(1)
    })

    test(`Load main page and check that it is without header using ${renderer} renderer`, async () => {
      const { dump } = await setupScrapeClasses({ mwUrl: 'https://en.wikivoyage.org' }) // en wikipedia
      await RenderingContext.createRenderers(renderer as renderName, true)
      const articleId = 'Main_Page'
      const articleUrl = Downloader.getArticleUrl(articleId)
      const _articleDetailsRet = await Downloader.getArticleDetailsIds([articleId])
      const articlesDetail = mwRetToArticleDetail(_articleDetailsRet)
      const { articleDetailXId } = RedisStore
      const articleDetail = { title: articleId, timestamp: '2023-08-20T14:54:01Z' }
      articleDetailXId.setMany(articlesDetail)
      const result = await Downloader.getArticle(articleId, articleDetailXId, RenderingContext.articlesRenderer, articleUrl, dump, articleDetail)
      const articleDoc = domino.createDocument(result[0].html)
      expect(articleDoc.querySelector('h1.article-header')).toBeFalsy()
    })

    test(`--customFlavour using ${renderer} renderer`, async () => {
      const { dump } = await setupScrapeClasses({ format: 'nopic' }) // en wikipedia
      await RenderingContext.createRenderers(renderer as renderName, true)
      class CustomFlavour implements CustomProcessor {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        public async shouldKeepArticle(articleId: string, doc: Document) {
          return articleId !== 'London'
        }
        public async preProcessArticle(articleId: string, doc: Document) {
          if (articleId === 'Paris') {
            const h2 = doc.createElement('h2')
            h2.textContent = 'INSERTED_BY_PRE_PROCESSOR'
            h2.id = 'PRE_PROCESSOR'
            doc.body.appendChild(h2)
          }
          return doc
        }
        public async postProcessArticle(articleId: string, doc: Document) {
          if (articleId === 'Prague') {
            const h2 = doc.createElement('h2')
            h2.textContent = 'INSERTED_BY_POST_PROCESSOR'
            h2.id = 'POST_PROCESSOR'
            doc.body.appendChild(h2)
          }
          return doc
        }
      }
      const customFlavour = new CustomFlavour()
      dump.customProcessor = customFlavour

      const _articlesDetail = await Downloader.getArticleDetailsIds(['London', 'Paris', 'Prague'])
      const articlesDetail = mwRetToArticleDetail(_articlesDetail)
      const { articleDetailXId } = RedisStore
      await articleDetailXId.flush()
      await articleDetailXId.setMany(articlesDetail)

      const writtenArticles: { [key: string]: StringItem } = {}
      await saveArticles(
        {
          addItem(article: StringItem) {
            if (article.mimeType === 'text/html') {
              writtenArticles[article.title] = article
            }
            return Promise.resolve(null)
          },
        } as any,

        dump,
      )

      // London was correctly filtered out by customFlavour
      expect(writtenArticles.London).toBeUndefined()
      expect(writtenArticles.Paris).toBeDefined()
      expect(writtenArticles.Prague).toBeDefined()

      const ParisDocument = domino.createDocument((writtenArticles.Paris as StringItem).getContentProvider().feed().toString())
      const PragueDocument = domino.createDocument((writtenArticles.Prague as StringItem).getContentProvider().feed().toString())

      // Paris was correctly pre-processed
      expect(ParisDocument.querySelector('#PRE_PROCESSOR')).toBeDefined()
      // Prague was correctly post-processed
      expect(PragueDocument.querySelector('#POST_PROCESSOR')).toBeDefined()
    })

    test(`Removes inline JS using ${renderer} renderer`, async () => {
      const { dump } = await setupScrapeClasses({ mwUrl: 'https://en.wikipedia.org' }) // en wikipedia
      await RenderingContext.createRenderers(renderer as renderName, true)
      const articleId = 'Potato'
      const articleUrl = Downloader.getArticleUrl(articleId)
      const _articleDetailsRet = await Downloader.getArticleDetailsIds([articleId])
      const articlesDetail = mwRetToArticleDetail(_articleDetailsRet)
      const { articleDetailXId } = RedisStore
      const articleDetail = { title: articleId, timestamp: '2023-08-20T14:54:01Z' }
      articleDetailXId.setMany(articlesDetail)
      const result = await Downloader.getArticle(articleId, articleDetailXId, RenderingContext.articlesRenderer, articleUrl, dump, articleDetail)

      const articleDoc = domino.createDocument(result[0].html)

      // Document has scripts that we added, but shouldn't have any without a `src` (inline).
      const remainingInlineScripts = Array.from(articleDoc.querySelectorAll('script:not([src])'))
      expect(remainingInlineScripts.length).toBe(0)
    })

    test(`Remove empty sections for ${renderer} renderer`, async () => {
      const { dump } = await setupScrapeClasses({ mwUrl: 'https://en.wikivoyage.org', format: 'nopic' })
      await RenderingContext.createRenderers(renderer as renderName, true)
      const articleId = 'Western_Greenland'
      const articleUrl = Downloader.getArticleUrl(articleId)
      const _articleDetailsRet = await Downloader.getArticleDetailsIds([articleId])
      const articlesDetail = mwRetToArticleDetail(_articleDetailsRet)
      const { articleDetailXId } = RedisStore
      const articleDetail = { title: articleId, timestamp: '2023-08-20T14:54:01Z' }
      articleDetailXId.setMany(articlesDetail)
      const result = await Downloader.getArticle(articleId, articleDetailXId, RenderingContext.articlesRenderer, articleUrl, dump, articleDetail)
      const articleDoc = domino.createDocument(result[0].html)
      expect(articleDoc.querySelector('#Get_around')).toBeTruthy()
      expect(articleDoc.querySelector('#Do')).toBeFalsy()
      expect(articleDoc.querySelector('#Eat')).toBeTruthy()
      expect(articleDoc.querySelector('#Drink')).toBeFalsy()
    })

    test(`Keep empty sections for ${renderer} renderer`, async () => {
      const { dump } = await setupScrapeClasses({ mwUrl: 'https://en.wikivoyage.org', format: 'nopic' })
      dump.opts.keepEmptySections = true
      await RenderingContext.createRenderers(renderer as renderName, true)
      const articleId = 'Western_Greenland'
      const articleUrl = Downloader.getArticleUrl(articleId)
      const _articleDetailsRet = await Downloader.getArticleDetailsIds([articleId])
      const articlesDetail = mwRetToArticleDetail(_articleDetailsRet)
      const { articleDetailXId } = RedisStore
      const articleDetail = { title: articleId, timestamp: '2023-08-20T14:54:01Z' }
      articleDetailXId.setMany(articlesDetail)
      const result = await Downloader.getArticle(articleId, articleDetailXId, RenderingContext.articlesRenderer, articleUrl, dump, articleDetail)
      const articleDoc = domino.createDocument(result[0].html)
      expect(articleDoc.querySelector('#Get_around')).toBeTruthy()
      expect(articleDoc.querySelector('#Do')).toBeTruthy()
      expect(articleDoc.querySelector('#Eat')).toBeTruthy()
      expect(articleDoc.querySelector('#Drink')).toBeTruthy()
    })
  }
})
