import { execa } from 'execa'
import { rimraf } from 'rimraf'
import 'dotenv/config'
import { jest } from '@jest/globals'
import { testAllRenders } from '../testRenders.js'
import { zimcheckAvailable, zimcheck } from '../util.js'

jest.setTimeout(10000)

const pageList = 'Kiwix,Wikipedia,Internet,Real-time computer graphics,Wars_of_Augustus,Roman emperor'
const pageListToIgnore = 'Wikipedia, Internet, Wars of Augustus,Roman_emperor'

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  adminEmail: 'test@kiwix.org',
  pageList,
  pageListToIgnore,
  redis: process.env.REDIS,
  format: ['nopic'],
}

await testAllRenders('page-lists', parameters, async (outFiles) => {
  describe('pageList', () => {
    const listMinusIgnore = 2

    test(`pageList and pageListIgnore check using ${outFiles[0].renderer} renderer`, async () => {
      await execa('redis-cli flushall', { shell: true })

      // Created 1 output
      expect(outFiles).toHaveLength(1)

      for (const dump of outFiles) {
        if (dump.nopic) {
          // Output has right amount of pages
          expect(dump.status.pages.success).toEqual(listMinusIgnore)
          // Output has no failed page
          expect(dump.status.pages.hardFail).toEqual(0)
          expect(dump.status.pages.softFail).toEqual(0)
        }
      }

      // Scraped selected pages from wikipedia en');
      if (await zimcheckAvailable()) {
        await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
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
