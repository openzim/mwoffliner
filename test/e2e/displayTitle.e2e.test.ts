import { testRenders } from '../testRenders.js'
import domino from 'domino'
import { zimdump, zimcheck } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'

jest.setTimeout(60000)

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  articleList: 'Giraffe (album),Main Page', // use article with a custom display title
  adminEmail: 'test@kiwix.org',
}

await testRenders(
  'displayTitle',
  parameters,
  async (outFiles) => {
    const giraffeArticleMetaData = await zimdump(`list --details --url "Giraffe_(album)" ${outFiles[0].outFile}`)
    const giraffeArticleFromDump = await zimdump(`show --url "Giraffe_(album)" ${outFiles[0].outFile}`)
    const giraffeArticleDoc = domino.createDocument(giraffeArticleFromDump)

    const mainPageArticleMetaData = await zimdump(`list --details --url "Main_Page" ${outFiles[0].outFile}`)
    const mainPageArticleFromDump = await zimdump(`show --url "Main_Page" ${outFiles[0].outFile}`)
    const mainPageArticleDoc = domino.createDocument(mainPageArticleFromDump)

    describe('normal article display title', () => {
      test(`zimcheck for ${outFiles[0].renderer} renderer`, async () => {
        await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
      })

      test(`test article path for ${outFiles[0].renderer} renderer`, async () => {
        expect(giraffeArticleMetaData).toMatch(/path:\s*Giraffe_\(album\)/g)
      })

      test(`test article title for ${outFiles[0].renderer} renderer`, async () => {
        expect(giraffeArticleMetaData).toMatch(/title:\s*Giraffe \(album\)/g)
      })

      test(`test article header for ${outFiles[0].renderer} renderer`, async () => {
        const articleTitle = giraffeArticleDoc.querySelector('h1#firstHeading')
        expect(articleTitle).toBeTruthy()
        expect(articleTitle.innerHTML).toBe('<i>Giraffe</i> (album)')
      })
    })

    describe('main page display title', () => {
      test(`zimcheck for ${outFiles[0].renderer} renderer`, async () => {
        await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
      })

      test(`test article path for ${outFiles[0].renderer} renderer`, async () => {
        expect(mainPageArticleMetaData).toMatch(/path:\s*Main_Page/g)
      })

      test(`test article title for ${outFiles[0].renderer} renderer`, async () => {
        expect(mainPageArticleMetaData).toMatch(/title:\s*Main Page/g)
      })

      test(`test article header for ${outFiles[0].renderer} renderer`, async () => {
        const articleTitle = mainPageArticleDoc.querySelector('h1#firstHeading')
        expect(articleTitle).toBeTruthy()
        expect(articleTitle.style.display).toBe('none')
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
