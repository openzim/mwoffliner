import { startRedis, stopRedis, redisStore } from './bootstrap.js'
import domino from 'domino'

import { setupScrapeClasses } from '../util.js'
import { saveArticles, getModuleDependencies, applyOtherTreatments } from '../../src/util/saveArticles.js'
import { ZimArticle } from '@openzim/libzim'
import { Dump } from '../../src/Dump.js'
import { mwRetToArticleDetail, renderDesktopArticle, DELETED_ARTICLE_ERROR } from '../../src/util/index.js'
import { jest } from '@jest/globals'

jest.setTimeout(40000)

describe('saveArticles', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  test('Article html processing', async () => {
    const { downloader, mw, dump } = await setupScrapeClasses() // en wikipedia
    await downloader.checkCapabilities()
    await downloader.setBaseUrls()
    const _articlesDetail = await downloader.getArticleDetailsIds(['London'])
    const articlesDetail = mwRetToArticleDetail(_articlesDetail)
    const { articleDetailXId } = redisStore
    await articleDetailXId.flush()
    await articleDetailXId.setMany(articlesDetail)

    const addedArticles: (typeof ZimArticle)[] = []

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

    await expect(downloader.getArticle('non-existent-article', dump, articleDetailXId)).rejects.toThrowError('')

    const articleDoc = domino.createDocument(addedArticles.shift().bufferData.toString())

    // Successfully scrapped existent articles
    expect(articleDoc.querySelector('meta[name="geo.position"]')).toBeDefined()
    // Geo Position data is correct
    expect(articleDoc.querySelector('meta[name="geo.position"]')?.getAttribute('content')).toEqual('51.50722222;-0.1275')
  })

  describe('applyOtherTreatments', () => {
    // TODO: Fix unit tests below once 'keepEmptyParagraphs' option will be modified. See issues/1866
    /*
    let dump: Dump
    let dump2: Dump
    let articleHtml: string

    beforeEach(async () => {
      const classes = await setupScrapeClasses({ mwUrl: 'https://en.wikivoyage.org' }) // en wikipedia
      dump = classes.dump
      const downloader = classes.downloader

      await downloader.checkCapabilities()
      await downloader.setBaseUrls()
      const _articleDetailsRet = await downloader.getArticleDetailsIds(['Western_Greenland'])
      const articlesDetail = mwRetToArticleDetail(_articleDetailsRet)
      const { articleDetailXId } = redisStore
      articleDetailXId.setMany(articlesDetail)
      ;[{ html: articleHtml }] = await downloader.getArticle('Western_Greenland', dump, articleDetailXId)
      dump2 = new Dump('', { keepEmptyParagraphs: true } as any, dump.mwMetaData)
    })

    test('Found no empty details elements when they should be stripped in mobile view', async () => {
      const doc = domino.createDocument(articleHtml)
      await applyOtherTreatments(doc, dump)

      const details = Array.from(doc.querySelectorAll('details'))
      let fewestChildren = 0
      for (const d of details) {
        if (fewestChildren === 0 || d.children.length < fewestChildren) {
          fewestChildren = d.children.length
        }
      }
      expect(fewestChildren).toBeGreaterThan(0)
    })

    test('Found empty details elements when they should be left im mobile view', async () => {
      const doc = domino.createDocument(articleHtml)
      await applyOtherTreatments(doc, dump2)

      const details = Array.from(doc.querySelectorAll('details'))

      let fewestChildren = 0
      for (const d of details) {
        if (fewestChildren === 0 || d.children.length < fewestChildren) {
          fewestChildren = d.children.length
        }
      }
      expect(fewestChildren).toBeLessThanOrEqual(1)
    })

    test('Found empty sections when they should be left im desktop view', async () => {
      const doc = domino.createDocument(articleHtml)
      await applyOtherTreatments(doc, dump2)

      const sections = Array.from(doc.querySelectorAll('section'))

      let fewestChildren = 0
      for (const d of sections) {
        if (fewestChildren === 0 || d.children.length < fewestChildren) {
          fewestChildren = d.children.length
        }
      }
      expect(fewestChildren).toBeLessThanOrEqual(1)
    })
    */
  })

  test('--customFlavour', async () => {
    const { downloader, mw, dump } = await setupScrapeClasses({ format: 'nopic' }) // en wikipedia
    await downloader.checkCapabilities()
    await downloader.setBaseUrls()
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

    const _articlesDetail = await downloader.getArticleDetailsIds(['London', 'Paris', 'Prague'])
    const articlesDetail = mwRetToArticleDetail(_articlesDetail)
    const { articleDetailXId } = redisStore
    await articleDetailXId.flush()
    await articleDetailXId.setMany(articlesDetail)

    const writtenArticles: any = {}
    await saveArticles(
      {
        addArticle(article: typeof ZimArticle) {
          if (article.mimeType === 'text/html') {
            writtenArticles[article.title] = article
          }
          return Promise.resolve(null)
        },
      } as any,
      downloader,
      redisStore,
      mw,
      dump,
    )

    const ParisDocument = domino.createDocument(writtenArticles.Paris.bufferData)
    const PragueDocument = domino.createDocument(writtenArticles.Prague.bufferData)

    // London was correctly filtered out by customFlavour
    expect(writtenArticles.London).toBeUndefined()
    // Paris was correctly pre-processed
    expect(ParisDocument.querySelector('#PRE_PROCESSOR')).toBeDefined()
    // Prague was correctly post-processed
    expect(PragueDocument.querySelector('#POST_PROCESSOR')).toBeDefined()
  })

  test('Test deleted article rendering', async () => {
    const articleJsonObject = {
      visualeditor: { oldid: 0 },
    }
    // Throwing error if article is deleted
    expect(() => renderDesktopArticle(articleJsonObject, 'deletedArticle', { title: 'deletedArticle' })).toThrow(new Error(DELETED_ARTICLE_ERROR))
  })

  test('Load inline js from HTML', async () => {
    const { downloader, mw } = await setupScrapeClasses() // en wikipedia

    const _moduleDependencies = await getModuleDependencies('Potato', mw, downloader)
    // next variables declared to avoid "variable is not defined" errors
    let RLCONF: any
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let RLSTATE: any
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let RLPAGEMODULES: any
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const document: any = { documentElement: { className: '' }, cookie: '' }

    // eslint-disable-next-line no-eval
    eval(_moduleDependencies.jsConfigVars)
    expect(RLCONF).toMatchObject({
      wgPageName: 'Potato',
      wgTitle: 'Potato',
      wgPageContentLanguage: 'en',
      wgPageContentModel: 'wikitext',
      wgRelevantPageName: 'Potato',
      wgRelevantArticleId: 23501,
    })
  })
})
