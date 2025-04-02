import { execa } from 'execa'
import { rimraf } from 'rimraf'
import 'dotenv/config'
import { jest } from '@jest/globals'
import { testAllRenders } from '../testRenders.js'
import { zimcheckAvailable, zimcheck } from '../util.js'

jest.setTimeout(10000)

const articleList = 'Kiwix,Wikipedia,Internet,Real-time computer graphics'
const articleListToIgnore = 'Wikipedia, Internet'

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  adminEmail: 'test@kiwix.org',
  articleList,
  articleListToIgnore,
  redis: process.env.REDIS,
  format: ['nopic'],
}

await testAllRenders('article-lists', parameters, async (outFiles) => {
  describe('articleList', () => {
    const listMinusIgnore = 2

    test(`articleList and articleListIgnore check using ${outFiles[0].renderer} renderer`, async () => {
      await execa('redis-cli flushall', { shell: true })

      // Created 1 output
      expect(outFiles).toHaveLength(1)

      for (const dump of outFiles) {
        if (dump.nopic) {
          // Output has right amount of articles
          expect(dump.status.articles.success).toEqual(listMinusIgnore)
          // Output has no failed article
          expect(dump.status.articles.fail).toEqual(0)
        }
      }

      // Scraped selected articles from wikipedia en');
      if (await zimcheckAvailable()) {
        await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
      } else {
        console.log('Zimcheck not installed, skipping test')
      }

      const redisScan = await execa('redis-cli --scan', { shell: true })
      // Redis has been cleared
      expect(redisScan.stdout).toEqual('')
    })
    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  })
})
