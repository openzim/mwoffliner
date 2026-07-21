import { rimraf } from 'rimraf'
import { testAllRenders } from '../testRenders.js'
import { jest } from '@jest/globals'
import 'dotenv/config.js'

jest.setTimeout(200000)

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  adminEmail: 'test@kiwix.org',
  pageList: 'https://download.openzim.org/wp1/enwiki/tops/10.tsv',
  redis: process.env.REDIS,
  format: ['nopic', 'novid', 'nopdf', 'nodet'],
}

await testAllRenders('en10-wikipedia', parameters, async (outFiles) => {
  describe('en10', () => {
    test(`Simple pageList for ${outFiles[0]?.renderer} renderer`, async () => {
      // Created 2 outputs
      expect(outFiles).toHaveLength(4)

      for (const dump of outFiles) {
        // numbers below are just an estimate and can change with time,
        // as wiki changes).
        if (dump.nopic) {
          // has enough files
          expect(dump.status.files.success).toBeGreaterThan(110)
          expect(dump.status.files.success).toBeLessThan(130)
        } else if (dump.nodet) {
          expect(dump.status.files.success).toBeGreaterThan(130)
          expect(dump.status.files.success).toBeLessThan(150)
        } else {
          // novid, nopdf
          expect(dump.status.files.success).toBeGreaterThan(640)
          expect(dump.status.files.success).toBeLessThan(700)
        }
        // has enough redirects
        if (dump.nodet) {
          expect(dump.status.redirects.written).toBeGreaterThan(420)
          expect(dump.status.redirects.written).toBeLessThan(470)
          expect(dump.status.redirects.ignored).toBeGreaterThan(150)
          expect(dump.status.redirects.ignored).toBeLessThan(200)
        } else {
          expect(dump.status.redirects.written).toBeGreaterThan(600)
          expect(dump.status.redirects.written).toBeLessThan(650)
          expect(dump.status.redirects.ignored).toBe(0)
        }
        // has 10 pages
        expect(dump.status.pages.success).toEqual(10)
        // No page and files error
        expect(dump.status.pages.hardFail).toEqual(0)
        expect(dump.status.pages.softFail).toEqual(0)
        expect(dump.status.files.fail).toEqual(0)
      }
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  })
})
