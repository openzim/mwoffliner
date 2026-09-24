import { testRenders } from '../testRenders.js'
import domino from 'domino'
import { zimdump, zimcheck } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'

jest.setTimeout(200000)

/**
 * Scenario 1: pageList with multiple pages without customMainPage.
 * There is no ZIM main page, so in nodet mode ALL pages (including Main_Page)
 * should be trimmed to the lead section. In non-nodet (nopic) mode, full sections
 * are retained.
 */
await testRenders(
  'mini-multipage-trimmed',
  {
    mwUrl: 'https://en.wikipedia.org',
    pageList: 'Earth,Main_Page',
    adminEmail: 'test@kiwix.org',
    format: ['nodet,nopic'],
  },
  async (outFiles) => {
    describe('multi-page pageList without customMainPage', () => {
      for (const dump of outFiles) {
        test(`zimcheck for ${dump.renderer} renderer [format: ${dump.format}]`, async () => {
          await expect(zimcheck(dump.outFile)).resolves.not.toThrow()
        })

        if (dump.nodet) {
          test(`nodet: Earth page is trimmed to lead section only [${dump.format}]`, async () => {
            const earthPageFromDump = await zimdump(`show --url "Earth" ${dump.outFile}`)
            const earthPageDoc = domino.createDocument(earthPageFromDump)
            const sectionNodes = earthPageDoc.querySelectorAll('[data-mw-section-id]')
            for (const section of Array.from(sectionNodes)) {
              expect(section.getAttribute('data-mw-section-id')).toBe('0')
            }
          })

          test(`nodet: Main_Page is trimmed to lead section (no ZIM main page in multi-page pageList) [${dump.format}]`, async () => {
            const mainPageFromDump = await zimdump(`show --url "Main_Page" ${dump.outFile}`)
            const mainPageDoc = domino.createDocument(mainPageFromDump)
            const sectionNodes = mainPageDoc.querySelectorAll('[data-mw-section-id]')
            for (const section of Array.from(sectionNodes)) {
              expect(section.getAttribute('data-mw-section-id')).toBe('0')
            }
          })
        } else {
          test(`nopic: Earth page is not trimmed to lead section only [${dump.format}]`, async () => {
            const earthPageFromDump = await zimdump(`show --url "Earth" ${dump.outFile}`)
            const earthPageDoc = domino.createDocument(earthPageFromDump)
            const sectionNodes = earthPageDoc.querySelectorAll('[data-mw-section-id]')
            const sectionIds = Array.from(sectionNodes).map((n) => n.getAttribute('data-mw-section-id'))
            expect(sectionIds.some((id) => id !== '0')).toBe(true)
          })

          test(`nopic: Main_Page is not trimmed to lead section only [${dump.format}]`, async () => {
            const mainPageFromDump = await zimdump(`show --url "Main_Page" ${dump.outFile}`)
            const mainPageDoc = domino.createDocument(mainPageFromDump)
            const sectionNodes = mainPageDoc.querySelectorAll('[data-mw-section-id]')
            const sectionIds = Array.from(sectionNodes).map((n) => n.getAttribute('data-mw-section-id'))
            expect(sectionIds.some((id) => id !== '0')).toBe(true)
          })
        }
      }
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
  ['ActionParse'],
)

/**
 * Scenario 2: customMainPage set with pageList.
 * The custom main page is the ZIM main page and must NOT be trimmed in nodet mode.
 * All other pages should still be trimmed to lead section in nodet mode.
 */
await testRenders(
  'mini-custom-main-page',
  {
    mwUrl: 'https://en.wikipedia.org',
    pageList: 'Earth,Main_Page',
    customMainPage: 'Main_Page',
    adminEmail: 'test@kiwix.org',
    format: ['nodet,nopic'],
  },
  async (outFiles) => {
    describe('customMainPage ZIM main page preservation', () => {
      for (const dump of outFiles) {
        test(`zimcheck for ${dump.renderer} renderer [format: ${dump.format}]`, async () => {
          await expect(zimcheck(dump.outFile)).resolves.not.toThrow()
        })

        test(`custom main page (Main_Page) is not trimmed to lead section only [${dump.format}]`, async () => {
          const mainPageFromDump = await zimdump(`show --url "Main_Page" ${dump.outFile}`)
          const mainPageDoc = domino.createDocument(mainPageFromDump)
          const sectionNodes = mainPageDoc.querySelectorAll('[data-mw-section-id]')
          const sectionIds = Array.from(sectionNodes).map((n) => n.getAttribute('data-mw-section-id'))
          // ZIM main page must have sections beyond the lead in both nodet and nopic
          expect(sectionIds.some((id) => id !== '0')).toBe(true)
        })

        if (dump.nodet) {
          test(`nodet: Earth (non-main page) is trimmed to lead section [${dump.format}]`, async () => {
            const earthPageFromDump = await zimdump(`show --url "Earth" ${dump.outFile}`)
            const earthPageDoc = domino.createDocument(earthPageFromDump)
            const sectionNodes = earthPageDoc.querySelectorAll('[data-mw-section-id]')
            for (const section of Array.from(sectionNodes)) {
              expect(section.getAttribute('data-mw-section-id')).toBe('0')
            }
          })
        } else {
          test(`nopic: Earth (non-main page) is not trimmed to lead section [${dump.format}]`, async () => {
            const earthPageFromDump = await zimdump(`show --url "Earth" ${dump.outFile}`)
            const earthPageDoc = domino.createDocument(earthPageFromDump)
            const sectionNodes = earthPageDoc.querySelectorAll('[data-mw-section-id]')
            const sectionIds = Array.from(sectionNodes).map((n) => n.getAttribute('data-mw-section-id'))
            expect(sectionIds.some((id) => id !== '0')).toBe(true)
          })
        }
      }
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
  ['ActionParse'],
)

/**
 * Scenario 3: Single page passed in pageList.
 * It is automatically set as the ZIM main page (#1891) and must NOT be trimmed in either mode.
 */
await testRenders(
  'mini-single-page-landing',
  {
    mwUrl: 'https://en.wikipedia.org',
    pageList: 'Main_Page',
    adminEmail: 'test@kiwix.org',
    format: ['nodet,nopic'],
  },
  async (outFiles) => {
    describe('single page pageList ZIM main page preservation', () => {
      for (const dump of outFiles) {
        test(`zimcheck for ${dump.renderer} renderer [format: ${dump.format}]`, async () => {
          await expect(zimcheck(dump.outFile)).resolves.not.toThrow()
        })

        test(`single page is automatically the ZIM main page and is not trimmed to lead section only [${dump.format}]`, async () => {
          const mainPageFromDump = await zimdump(`show --url "Main_Page" ${dump.outFile}`)
          const mainPageDoc = domino.createDocument(mainPageFromDump)
          const sectionNodes = mainPageDoc.querySelectorAll('[data-mw-section-id]')
          const sectionIds = Array.from(sectionNodes).map((n) => n.getAttribute('data-mw-section-id'))
          expect(sectionIds.some((id) => id !== '0')).toBe(true)
        })
      }
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
  ['ActionParse'],
)
