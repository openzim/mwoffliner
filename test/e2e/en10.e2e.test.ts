import rimraf from 'rimraf'
import { testAllRenders } from '../testAllRenders.js'
import { jest } from '@jest/globals'
import 'dotenv/config.js'

jest.setTimeout(200000)

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  adminEmail: 'test@kiwix.org',
  articleList: 'https://download.openzim.org/wp1/enwiki/tops/10.tsv',
  redis: process.env.REDIS,
  // format: ['nopic', 'novid', 'nopdf', 'nodet'],
  format: ['nopic', 'nopdf'],
  mwActionApiPath: 'w/api.php',
  mwWikiPath: '/',
}

await testAllRenders(parameters, async (outFiles) => {
  describe('en10', () => {
    test(`Simple articleList for ${outFiles[0]?.renderer} renderer`, async () => {
      // Created 2 outputs
      expect(outFiles).toHaveLength(2)

      for (const dump of outFiles) {
        if (dump.nopic) {
          // nopic has enough files
          expect(dump.status.files.success).toBeGreaterThan(16)
          expect(dump.status.files.success).toBeLessThan(25)
          // nopic has enough redirects
          expect(dump.status.redirects.written).toBeGreaterThan(480)
          // nopic has 10 articles
          expect(dump.status.articles.success).toEqual(10)
          // No article and files error
          expect(dump.status.articles.fail).toEqual(0)
          expect(dump.status.files.fail).toEqual(0)
        } else if (dump.novid) {
          // novid has enough files
          expect(dump.status.files.success).toBeGreaterThan(420)
          // novid has enough redirects
          expect(dump.status.redirects.written).toBeGreaterThan(480)
          // novid has 10 articles
          expect(dump.status.articles.success).toEqual(10)
        } else if (dump.nopdf) {
          // nopdf has enough files
          expect(dump.status.files.success).toBeGreaterThan(450)
          // nopdf has enough redirects
          expect(dump.status.redirects.written).toBeGreaterThan(480)
          // nopdf has 10 articles
          expect(dump.status.articles.success).toEqual(10)
        } else if (dump.nodet) {
          // nodet has enough files
          expect(dump.status.files.success).toBeGreaterThan(50)
          // nodet has enough redirects
          expect(dump.status.redirects.written).toBeGreaterThan(480)
          // nodet has 10 articles
          expect(dump.status.articles.success).toEqual(10)
        }

        // No download error
        expect(dump.status.articles.fail).toEqual(0)
        expect(dump.status.files.fail).toEqual(0)
      }
    })

    afterAll(() => {
      rimraf.sync(`./${outFiles[0].testId}`)
    })
  })
})
