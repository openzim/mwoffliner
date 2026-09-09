import { testRenders } from '../testRenders.js'
import domino from 'domino'
import { zimdump, zimcheck } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'

jest.setTimeout(60000)

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  pageList: 'Earth,Main Page',
  adminEmail: 'test@kiwix.org',
  format: ['nodet,nopic'],
}

await testRenders(
  'miniLandingPage',
  parameters,
  async (outFiles) => {
    const mainPageFromDump = await zimdump(`show --url "Main_Page" ${outFiles[0].outFile}`)
    const mainPageDoc = domino.createDocument(mainPageFromDump)

    const earthPageFromDump = await zimdump(`show --url "Earth" ${outFiles[0].outFile}`)
    const earthPageDoc = domino.createDocument(earthPageFromDump)

    describe('mini ZIM landing page content preservation', () => {
      test(`zimcheck for ${outFiles[0].renderer} renderer`, async () => {
        await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
      })

      test('main page is not trimmed to lead section and contains full landing page structure', async () => {
        expect(mainPageDoc.body.innerHTML.length).toBeGreaterThan(500)
        expect(mainPageDoc.querySelector('#mp-upper, #bodyContent, .mw-parser-output')).toBeTruthy()
      })

      test('regular article page is saved with nodet lead section', async () => {
        expect(earthPageDoc.body.innerHTML.length).toBeGreaterThan(100)
      })
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
  ['ActionParse'],
)
