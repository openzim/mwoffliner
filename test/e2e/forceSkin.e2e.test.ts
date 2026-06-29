import { testRenders } from '../testRenders.js'
import domino from 'domino'
import { zimdump, zimcheck } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'

jest.setTimeout(60000)

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  pageList: 'Kiwix',
  adminEmail: 'test@kiwix.org',
  forceSkin: 'monobook', // Use unsupported skin
}

await testRenders(
  'forceSkin',
  parameters,
  async (outFiles) => {
    const pageFromDump = await zimdump(`show --url "${parameters.pageList.replace(' ', '_')}" ${outFiles[0].outFile}`)
    const pageDoc = domino.createDocument(pageFromDump)

    test(`zimcheck for ${outFiles[0].renderer} renderer`, async () => {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
    })

    test(`test page skin for ${outFiles[0].renderer} renderer`, async () => {
      expect(pageDoc.body.classList.contains('skin-monobook')).toBe(true)
    })

    test(`test page template for ${outFiles[0].renderer} renderer`, async () => {
      expect(pageDoc.body.classList.contains('mwoffliner-fallback')).toBe(true)
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
  ['ActionParse'],
)
