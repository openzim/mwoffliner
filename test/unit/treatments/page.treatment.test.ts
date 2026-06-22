import domino from 'domino'
import RedisStore from '../../../src/RedisStore.js'
import { StringItem } from '@openzim/libzim'
import { mwRetToPageDetail } from '../../../src/util/mw-api.js'
import { setupScrapeClasses } from '../../util.js'
import { startRedis, stopRedis } from '../bootstrap.js'
import { savePages } from '../../../src/util/savePages.js'
import { jest } from '@jest/globals'
import { RENDERERS_LIST } from '../../../src/util/const.js'
import Downloader from '../../../src/Downloader.js'
import RenderingContext from '../../../src/renderers/rendering.context.js'
import { renderName } from '../../../src/renderers/abstract.renderer.js'

jest.setTimeout(10000)

describe('PageTreatment', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  for (const renderer of RENDERERS_LIST) {
    test(`Html processing for ${renderer} render`, async () => {
      const { dump } = await setupScrapeClasses() // en wikipedia
      await RenderingContext.createRenderers(renderer as renderName)
      const _pagesDetail = await Downloader.getPagesByTitle(['London', 'Non-existent-page'] as PageTitle[])
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

      // Successfully scrapped existent pages + placeholder for deleted page
      expect(addedItems).toHaveLength(2)

      expect([addedItems[0].title, addedItems[1].title]).toEqual(expect.arrayContaining(['London', '']))
      expect([addedItems[0].path, addedItems[1].path]).toEqual(expect.arrayContaining(['London', 'Non-existent-page']))

      for (let i = 0; i <= 1; i++) {
        if (addedItems[i].path === 'London') {
          const pageDoc = domino.createDocument(addedItems[i].getContentProvider().feed().toString())

          // Successfully scrapped existent pages
          expect(pageDoc.querySelector('meta[name="geo.position"]')).toBeDefined()
          // Geo Position data is correct
          expect(pageDoc.querySelector('meta[name="geo.position"]')?.getAttribute('content')).toEqual('51.50722222;-0.1275')
        }

        if (addedItems[i].path === 'Non-existent-page') {
          expect(addedItems[i].getContentProvider().feed().toString()).toContain('Oops. Page not found.')
        }
      }
    })
  }
})
