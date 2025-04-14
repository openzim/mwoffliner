import { rimraf } from 'rimraf'
import { testAllRenders } from '../testRenders.js'
import { jest } from '@jest/globals'
import 'dotenv/config.js'

jest.setTimeout(200000)

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  adminEmail: 'test@kiwix.org',
  articleList: 'https://api.wp1.openzim.org/v1/builders/28a933d2-1903-417d-939e-3b6e8ee7a126/selection/latest.tsv',
  redis: process.env.REDIS,
  // format: ['nopic', 'novid', 'nopdf', 'nodet'],
  format: ['nopic', 'nopdf'],
}

await testAllRenders('en10-wikipedia', parameters, async (outFiles) => {
  describe('en10', () => {
    test(`Simple articleList for ${outFiles[0]?.renderer} renderer`, async () => {
      // Created 2 outputs
      expect(outFiles).toHaveLength(2)

      for (const dump of outFiles) {
        if (dump.nopic) {
          // nopic has enough files (this is just an estimate and can change
          // with time, as new Mediwiki versions are released).
          expect(dump.status.files.success).toBeGreaterThanOrEqual(outFiles[0].renderer == 'WikimediaMobile' ? 42 : 47)
          expect(dump.status.files.success).toBeLessThan(59)
          // nopic has enough redirects
          expect(dump.status.redirects.written).toBeGreaterThan(500)
          // nopic has 10 articles
          expect(dump.status.articles.success).toEqual(10)
          // No article and files error
          expect(dump.status.articles.fail).toEqual(0)
          expect(dump.status.files.fail).toEqual(0)
        } else if (dump.novid) {
          // novid has enough files
          expect(dump.status.files.success).toBeGreaterThan(314)
          // novid has enough redirects
          expect(dump.status.redirects.written).toBeGreaterThan(314)
          // novid has 10 articles
          expect(dump.status.articles.success).toEqual(10)
        } else if (dump.nopdf) {
          // nopdf has enough files
          expect(dump.status.files.success).toBeGreaterThan(340)
          // nopdf has enough redirects
          expect(dump.status.redirects.written).toBeGreaterThan(314)
          // nopdf has 10 articles
          expect(dump.status.articles.success).toEqual(10)
        } else if (dump.nodet) {
          // nodet has enough files
          expect(dump.status.files.success).toBeGreaterThan(50)
          // nodet has enough redirects
          expect(dump.status.redirects.written).toBeGreaterThan(314)
          // nodet has 10 articles
          expect(dump.status.articles.success).toEqual(10)
        }

        // No download error
        expect(dump.status.articles.fail).toEqual(0)
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
