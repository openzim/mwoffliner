import domino from 'domino'

import RedisStore from '../../src/RedisStore.js'
import { startRedis, stopRedis } from './bootstrap.js'
import { setupScrapeClasses } from '../util.js'
import { savePages, savePage } from '../../src/util/savePages.js'
import { StringItem } from '@openzim/libzim'
import { mwRetToPageDetail } from '../../src/util/index.js'
import { jest } from '@jest/globals'
import { RENDERERS_LIST } from '../../src/util/const.js'
import { renderName } from '../../src/renderers/abstract.renderer.js'
import Downloader from '../../src/Downloader.js'
import RenderingContext from '../../src/renderers/rendering.context.js'

jest.setTimeout(40000)

describe('savePages', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  for (const renderer of RENDERERS_LIST) {
    test(`Page html processing using ${renderer} renderer`, async () => {
      const { dump } = await setupScrapeClasses() // en wikipedia
      await RenderingContext.createRenderers(renderer as renderName)

      const _pagesDetail = await Downloader.getPagesByTitle(['London'] as PageTitle[])
      const pagesDetail = mwRetToPageDetail(_pagesDetail)
      const { pagesStore: pageDetailStore } = RedisStore
      await pageDetailStore.flush()
      await pageDetailStore.setMany(pagesDetail)

      const addedItems: StringItem[] = []

      // TODO: use proper spied (like sinon.js)
      await savePages(
        {
          addItem(item: StringItem) {
            if (item.mimeType === 'text/html') {
              addedItems.push(item)
            }
            return Promise.resolve(null)
          },
        } as any,
        dump,
      )

      // Successfully scrapped existent pages
      expect(addedItems).toHaveLength(1)
      expect(addedItems[0].title).toEqual('London')

      const pageDoc = domino.createDocument(addedItems.shift().getContentProvider().feed().toString())

      // Successfully scrapped existent pages
      expect(pageDoc.querySelector('meta[name="geo.position"]')).toBeDefined()
      // Geo Position data is correct
      expect(pageDoc.querySelector('meta[name="geo.position"]')?.getAttribute('content')).toEqual('51.50722222;-0.1275')
      // Check if header exists
      expect(pageDoc.querySelector('h1#firstHeading, h1.page-header, h1.pcs-edit-section-title')).toBeTruthy()
    })

    test(`Check nodet page for en.wikipedia.org using ${renderer} renderer`, async () => {
      const { dump } = await setupScrapeClasses({ mwUrl: 'https://en.wikipedia.org', format: 'nodet' }) // en wikipedia
      await RenderingContext.createRenderers(renderer as renderName)
      const pageTitle = 'Canada' as PageTitle
      const pageUrl = Downloader.getPageUrl(pageTitle, { sectionId: '0' })
      const _pageDetailsRet = await Downloader.getPagesByTitle([pageTitle])
      const pagesDetail = mwRetToPageDetail(_pageDetailsRet)
      const { pagesStore: pageDetailStore } = RedisStore
      const pageDetail = { title: pageTitle, timestamp: '2023-09-10T17:36:04Z' }
      pageDetailStore.setMany(pagesDetail)
      const result = await Downloader.getPage(pageTitle, RenderingContext.pagesRenderer, pageUrl, dump, pageDetail)

      const pageDoc = domino.createDocument(result.items[0].htmlContent)

      const headings = Array.from(pageDoc.querySelectorAll('.mw-heading'))
      const infoboxes = Array.from(pageDoc.querySelectorAll('table.infobox'))
      const paragraphs = Array.from(pageDoc.querySelectorAll('p'))

      expect(headings).toHaveLength(0)
      expect(infoboxes).toHaveLength(1)
      expect(paragraphs.length).toBeGreaterThan(1)
    })

    test(`Load main page and check that it is without header using ${renderer} renderer`, async () => {
      const { dump } = await setupScrapeClasses({ mwUrl: 'https://en.wikivoyage.org' }) // en wikipedia
      await RenderingContext.createRenderers(renderer as renderName)
      const pageTitle = 'Main_Page' as PageTitle
      const pageUrl = Downloader.getPageUrl(pageTitle)
      const _pageDetailsRet = await Downloader.getPagesByTitle([pageTitle])
      const pagesDetail = mwRetToPageDetail(_pageDetailsRet)
      const { pagesStore: pageDetailStore } = RedisStore
      const pageDetail = { title: pageTitle, timestamp: '2023-08-20T14:54:01Z' }
      pageDetailStore.setMany(pagesDetail)
      const result = await Downloader.getPage(pageTitle, RenderingContext.pagesRenderer, pageUrl, dump, pageDetail)
      const pageDoc = domino.createDocument(result.items[0].htmlContent)
      expect(pageDoc.querySelector('h1.page-header')).toBeFalsy()
    })

    test(`--customFlavour using ${renderer} renderer`, async () => {
      const { dump } = await setupScrapeClasses({ format: 'nopic' }) // en wikipedia
      await RenderingContext.createRenderers(renderer as renderName)
      class CustomFlavour implements CustomProcessor {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        public async shouldKeepPage(pageTitle: string, doc: Document) {
          return pageTitle !== 'London'
        }
        public async preProcessPage(pageTitle: string, doc: Document) {
          if (pageTitle === 'Paris') {
            const h2 = doc.createElement('h2')
            h2.textContent = 'INSERTED_BY_PRE_PROCESSOR'
            h2.id = 'PRE_PROCESSOR'
            doc.body.appendChild(h2)
          }
          return doc
        }
        public async postProcessPage(pageTitle: string, doc: Document) {
          if (pageTitle === 'Prague') {
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

      const _pagesDetail = await Downloader.getPagesByTitle(['London', 'Paris', 'Prague'] as PageTitle[])
      const pagesDetail = mwRetToPageDetail(_pagesDetail)
      const { pagesStore: pageDetailStore } = RedisStore
      await pageDetailStore.flush()
      await pageDetailStore.setMany(pagesDetail)

      const addedItems: { [key: string]: StringItem } = {}
      await savePages(
        {
          addItem(item: StringItem) {
            if (item.mimeType === 'text/html') {
              addedItems[item.title] = item
            }
            return Promise.resolve(null)
          },
        } as any,

        dump,
      )

      // London was correctly filtered out by customFlavour
      expect(addedItems.London).toBeUndefined()
      expect(addedItems.Paris).toBeDefined()
      expect(addedItems.Prague).toBeDefined()

      const ParisDocument = domino.createDocument((addedItems.Paris as StringItem).getContentProvider().feed().toString())
      const PragueDocument = domino.createDocument((addedItems.Prague as StringItem).getContentProvider().feed().toString())

      // Paris was correctly pre-processed
      expect(ParisDocument.querySelector('#PRE_PROCESSOR')).toBeDefined()
      // Prague was correctly post-processed
      expect(PragueDocument.querySelector('#POST_PROCESSOR')).toBeDefined()
    })

    test(`Removes inline JS using ${renderer} renderer`, async () => {
      const { dump } = await setupScrapeClasses({ mwUrl: 'https://en.wikipedia.org' }) // en wikipedia
      await RenderingContext.createRenderers(renderer as renderName)
      const pageTitle = 'Potato' as PageTitle
      const pageUrl = Downloader.getPageUrl(pageTitle)
      const _pageDetailsRet = await Downloader.getPagesByTitle([pageTitle])
      const pagesDetail = mwRetToPageDetail(_pageDetailsRet)
      const { pagesStore: pageDetailStore } = RedisStore
      const pageDetail = { title: pageTitle, timestamp: '2023-08-20T14:54:01Z' }
      pageDetailStore.setMany(pagesDetail)
      const result = await Downloader.getPage(pageTitle, RenderingContext.pagesRenderer, pageUrl, dump, pageDetail)

      const pageDoc = domino.createDocument(result.items[0].htmlContent)

      // Document has scripts that we added, but shouldn't have any without a `src` (inline).
      const remainingInlineScripts = Array.from(pageDoc.querySelectorAll('script:not([src]):not(#mwoffliner-jsConfigVars)'))
      expect(remainingInlineScripts.length).toBe(0)
    })

    test(`Remove empty sections for ${renderer} renderer`, async () => {
      const { dump } = await setupScrapeClasses({ mwUrl: 'https://en.wikivoyage.org', format: 'nopic' })
      await RenderingContext.createRenderers(renderer as renderName)
      const pageTitle = 'Western_Greenland' as PageTitle
      const pageUrl = Downloader.getPageUrl(pageTitle)
      const _pageDetailsRet = await Downloader.getPagesByTitle([pageTitle])
      const pagesDetail = mwRetToPageDetail(_pageDetailsRet)
      const { pagesStore: pageDetailStore } = RedisStore
      const pageDetail = { title: pageTitle, timestamp: '2023-08-20T14:54:01Z' }
      pageDetailStore.setMany(pagesDetail)
      const result = await Downloader.getPage(pageTitle, RenderingContext.pagesRenderer, pageUrl, dump, pageDetail)
      const pageDoc = domino.createDocument(result.items[0].htmlContent)
      expect(pageDoc.querySelector('#Get_around')).toBeTruthy()
      expect(pageDoc.querySelector('#Do')).toBeFalsy()
      expect(pageDoc.querySelector('#Eat')).toBeTruthy()
      expect(pageDoc.querySelector('#Drink')).toBeFalsy()
    })

    test(`Keep empty sections for ${renderer} renderer`, async () => {
      const { dump } = await setupScrapeClasses({ mwUrl: 'https://en.wikivoyage.org', format: 'nopic' })
      dump.opts.keepEmptySections = true
      await RenderingContext.createRenderers(renderer as renderName)
      const pageTitle = 'Western_Greenland' as PageTitle
      const pageUrl = Downloader.getPageUrl(pageTitle)
      const _pageDetailsRet = await Downloader.getPagesByTitle([pageTitle])
      const pagesDetail = mwRetToPageDetail(_pageDetailsRet)
      const { pagesStore: pageDetailStore } = RedisStore
      const pageDetail = { title: pageTitle, timestamp: '2023-08-20T14:54:01Z' }
      pageDetailStore.setMany(pagesDetail)
      const result = await Downloader.getPage(pageTitle, RenderingContext.pagesRenderer, pageUrl, dump, pageDetail)
      const pageDoc = domino.createDocument(result.items[0].htmlContent)
      expect(pageDoc.querySelector('#Get_around')).toBeTruthy()
      expect(pageDoc.querySelector('#Do')).toBeTruthy()
      expect(pageDoc.querySelector('#Eat')).toBeTruthy()
      expect(pageDoc.querySelector('#Drink')).toBeTruthy()
    })
  }

  test('Too long page title is truncated', async () => {
    const addedItems: StringItem[] = []

    const MAX_WORD_LENGTH = 240

    await savePage(
      {
        addItem(item: StringItem) {
          if (item.mimeType === 'text/html') {
            addedItems.push(item)
          }
          return Promise.resolve(null)
        },
      } as any,
      'any content',
      'a path',
      `${'a'.repeat(MAX_WORD_LENGTH)} ${'f'.repeat(MAX_WORD_LENGTH - 1)}Ö ${'c'.repeat(MAX_WORD_LENGTH + 1)} ${'d'.repeat(MAX_WORD_LENGTH)}`,
    )

    expect(addedItems.length).toBe(1)
    expect(addedItems[0].title).toBe(`${'a'.repeat(MAX_WORD_LENGTH)} ${'f'.repeat(MAX_WORD_LENGTH - 1)} ${'c'.repeat(MAX_WORD_LENGTH)} ${'d'.repeat(MAX_WORD_LENGTH)}`)
  })
})
