import { testRenders } from '../testRenders.js'
import domino from 'domino'
import { zimdump, zimcheck } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'

jest.setTimeout(60000)

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  articleList: 'Kiwix',
  adminEmail: 'test@kiwix.org',
  forceSkin: 'monobook', // Use unsupported skin
}

await testRenders(
  'forceSkin',
  parameters,
  async (outFiles) => {
    const articleFromDump = await zimdump(`show --url "${parameters.articleList.replace(' ', '_')}" ${outFiles[0].outFile}`)
    const articleDoc = domino.createDocument(articleFromDump)

    test(`zimcheck for ${outFiles[0].renderer} renderer`, async () => {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
    })

    test(`test article skin for ${outFiles[0].renderer} renderer`, async () => {
      expect(articleDoc.body.classList).toContain('skin-monobook')
    })

    test(`test article template for ${outFiles[0].renderer} renderer`, async () => {
      expect(articleDoc.body.classList).toContain('mwoffliner-fallback')
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
  ['ActionParse'],
)
