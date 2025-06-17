import { testRenders } from '../testRenders.js'
import domino from 'domino'
import { zimdump, zimcheck } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'

jest.setTimeout(60000)

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  articleList: 'Giraffe (album)', // use article with a custom display title
  adminEmail: 'test@kiwix.org',
}

await testRenders(
  'displayTitle',
  parameters,
  async (outFiles) => {
    const articleMetaData = await zimdump(`list --details --url "${parameters.articleList.replace(' ', '_')}" ${outFiles[0].outFile}`)
    const articleFromDump = await zimdump(`show --url "${parameters.articleList.replace(' ', '_')}" ${outFiles[0].outFile}`)
    const articleDoc = domino.createDocument(articleFromDump)

    test(`zimcheck for ${outFiles[0].renderer} renderer`, async () => {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
    })

    test(`test article path for ${outFiles[0].renderer} renderer`, async () => {
      expect(articleMetaData).toMatch(/path:\s*Giraffe_\(album\)/g)
    })

    test(`test article title for ${outFiles[0].renderer} renderer`, async () => {
      expect(articleMetaData).toMatch(/title:\s*Giraffe \(album\)/g)
    })

    test(`test article header for ${outFiles[0].renderer} renderer`, async () => {
      const articleTitle = articleDoc.querySelector('h1.firstHeading > span#openzim-page-title')
      expect(articleTitle).toBeTruthy()
      expect(articleTitle.innerHTML).toBe('<i>Giraffe</i> (album)')
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
  ['ActionParse'],
)
