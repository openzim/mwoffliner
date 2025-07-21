import { testAllRenders } from '../testRenders.js'
import { zimcheck } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'

jest.setTimeout(60000)

await testAllRenders(
  'wiktionary',
  {
    mwUrl: 'https://en.wiktionary.org',
    // fetch index article which will cause a conflict with default index page
    // fetch favicon article which will cause a conflict with former favicon illustration
    articleList: 'index,location,favicon',
    adminEmail: 'test@kiwix.org',
  },
  async (outFiles) => {
    test(`test ZIM integrity for ${outFiles[0]?.renderer} renderer`, async () => {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
)
