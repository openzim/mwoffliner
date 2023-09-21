import domino from 'domino'

import RedisStore from '../../src/RedisStore.js'
import { startRedis, stopRedis } from './bootstrap.js'
import { setupScrapeClasses } from '../util.js'
import { saveArticles } from '../../src/util/saveArticles.js'
import { ZimArticle } from '@openzim/libzim'
import { mwRetToArticleDetail, DELETED_ARTICLE_ERROR } from '../../src/util/index.js'
import { jest } from '@jest/globals'
import { getArticleUrl } from '../../src/util/saveArticles.js'
import { WikimediaDesktopRenderer } from '../../src/renderers/wikimedia-desktop.renderer.js'
import { VisualEditorRenderer } from '../../src/renderers/visual-editor.renderer.js'
import { RENDERERS_LIST } from '../../src/util/const.js'

jest.setTimeout(40000)

describe('saveArticles', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  test('Article html processing', async () => {
    const { MediaWiki, downloader, dump } = await setupScrapeClasses() // en wikipedia
    await MediaWiki.hasCoordinates(downloader)
    await MediaWiki.hasWikimediaDesktopRestApi()
    await MediaWiki.hasVisualEditorApi()
    await downloader.setBaseUrls()
    const _articlesDetail = await downloader.getArticleDetailsIds(['London'])
    const articlesDetail = mwRetToArticleDetail(_articlesDetail)
    const { articleDetailXId } = RedisStore
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
      dump,
    )

    // Successfully scrapped existent articles
    expect(addedArticles).toHaveLength(1)
    expect(addedArticles[0].aid).toEqual('A/London')

    const wikimediaDesktopRenderer = new WikimediaDesktopRenderer()
    const articleId = 'non-existent-article'
    const articleUrl = getArticleUrl(downloader, dump, articleId)
    const articleDetail = { title: 'Non-existent-article', missing: '' }
    const _moduleDependencies = await downloader.getModuleDependencies(articleDetail.title)

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
    // Check if header exists
    expect(articleDoc.querySelector('h1.article-header')).toBeTruthy()
  })

  for (const renderer of RENDERERS_LIST) {
    if (['WikimediaDesktop', 'VisualEditor'].includes(renderer)) {
      test(`Check nodet article for en.wikipedia.org using ${renderer} renderer`, async () => {
        let rendererInstance
        switch (renderer) {
          case 'VisualEditor':
            rendererInstance = new VisualEditorRenderer()
            break
          case 'WikimediaDesktop':
            rendererInstance = new WikimediaDesktopRenderer()
            break
          default:
            throw new Error(`Unknown renderer: ${renderer}`)
        }
        const { downloader, dump } = await setupScrapeClasses({ mwUrl: 'https://en.wikipedia.org', format: 'nodet' }) // en wikipedia
        await downloader.setBaseUrls(renderer)
        const articleId = 'Canada'
        const articleUrl = getArticleUrl(downloader, dump, articleId)
        const _articleDetailsRet = await downloader.getArticleDetailsIds([articleId])
        const articlesDetail = mwRetToArticleDetail(_articleDetailsRet)
        const { articleDetailXId } = RedisStore
        const articleDetail = { title: articleId, timestamp: '2023-09-10T17:36:04Z' }
        const _moduleDependencies = await downloader.getModuleDependencies(articleDetail.title)
        articleDetailXId.setMany(articlesDetail)
        const result = await downloader.getArticle(
          downloader.webp,
          _moduleDependencies,
          articleId,
          articleDetailXId,
          rendererInstance,
          articleUrl,
          dump,
          articleDetail,
          dump.isMainPage(articleId),
        )

        const articleDoc = domino.createDocument(result[0].html)

        const sections = Array.from(articleDoc.querySelectorAll('section'))
        const leadSection = sections[0]
        expect(sections.length).toEqual(1)
        expect(leadSection.getAttribute('data-mw-section-id')).toEqual('0')
      })
    }
  }

  test('Load main page and check that it is without header', async () => {
    const wikimediaDesktopRenderer = new WikimediaDesktopRenderer()
    const { downloader, dump } = await setupScrapeClasses({ mwUrl: 'https://en.wikivoyage.org' }) // en wikipedia
    await downloader.setBaseUrls()
    const articleId = 'Main_Page'
    const articleUrl = getArticleUrl(downloader, dump, articleId)
    const _articleDetailsRet = await downloader.getArticleDetailsIds([articleId])
    const articlesDetail = mwRetToArticleDetail(_articleDetailsRet)
    const { articleDetailXId } = RedisStore
    const articleDetail = { title: articleId }
    const _moduleDependencies = await downloader.getModuleDependencies(articleDetail.title)
    articleDetailXId.setMany(articlesDetail)
    const result = await downloader.getArticle(
      downloader.webp,
      _moduleDependencies,
      articleId,
      articleDetailXId,
      wikimediaDesktopRenderer,
      articleUrl,
      dump,
      articleDetail,
      dump.isMainPage(articleId),
    )

    const articleDoc = domino.createDocument(result[0].html)
    expect(articleDoc.querySelector('h1.article-header')).toBeFalsy()
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

      await downloader.setCapabilities()
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
    const { MediaWiki, downloader, dump } = await setupScrapeClasses({ format: 'nopic' }) // en wikipedia
    await MediaWiki.hasCoordinates(downloader)
    await MediaWiki.hasWikimediaDesktopRestApi()
    await MediaWiki.hasVisualEditorApi()
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
    const { articleDetailXId } = RedisStore
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

  test('Test deleted article rendering (Visual editor renderer)', async () => {
    const { downloader, dump } = await setupScrapeClasses() // en wikipedia
    const { articleDetailXId } = RedisStore
    const articleId = 'deletedArticle'

    const articleJsonObject = {
      visualeditor: { oldid: 0 },
    }

    const articleDetail = { title: articleId, missing: '' }
    const _moduleDependencies = await downloader.getModuleDependencies(articleDetail.title)

    const visualEditorRenderer = new VisualEditorRenderer()

    const renderOpts = {
      data: articleJsonObject,
      RedisStore,
      webp: downloader.webp,
      _moduleDependencies,
      articleId,
      articleDetailXId,
      articleDetail,
      isMainPage: dump.isMainPage(articleId),
      dump,
    }

    expect(async () => {
      await visualEditorRenderer.render(renderOpts)
    }).rejects.toThrow(new Error(DELETED_ARTICLE_ERROR))
  })

  test('Load inline js from HTML', async () => {
    const { downloader } = await setupScrapeClasses() // en wikipedia

    const _moduleDependencies = await downloader.getModuleDependencies('Potato')
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
