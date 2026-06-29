import { testRenders } from '../testRenders.js'
import domino from 'domino'
import { zimdump, zimcheck } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'

jest.setTimeout(60000)

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  pageList: 'Giraffe (album),Main Page', // use page with a custom display title
  adminEmail: 'test@kiwix.org',
  format: ['nodet,nopic'],
}

await testRenders(
  'displayTitle',
  parameters,
  async (outFiles) => {
    const giraffePageMetaData = await zimdump(`list --details --url "Giraffe_(album)" ${outFiles[0].outFile}`)
    const giraffePageFromDump = await zimdump(`show --url "Giraffe_(album)" ${outFiles[0].outFile}`)
    const giraffePageDoc = domino.createDocument(giraffePageFromDump)

    const mainPagePageMetaData = await zimdump(`list --details --url "Main_Page" ${outFiles[0].outFile}`)
    const mainPagePageFromDump = await zimdump(`show --url "Main_Page" ${outFiles[0].outFile}`)
    const mainPagePageDoc = domino.createDocument(mainPagePageFromDump)

    describe('normal page display title', () => {
      test(`zimcheck for ${outFiles[0].renderer} renderer`, async () => {
        await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
      })

      test(`test page path for ${outFiles[0].renderer} renderer`, async () => {
        expect(giraffePageMetaData).toMatch(/path:\s*Giraffe_\(album\)/g)
      })

      test(`test page title for ${outFiles[0].renderer} renderer`, async () => {
        expect(giraffePageMetaData).toMatch(/title:\s*Giraffe \(album\)/g)
      })

      test(`test page header for ${outFiles[0].renderer} renderer`, async () => {
        const pageTitle = giraffePageDoc.querySelector('h1#firstHeading')
        expect(pageTitle).toBeTruthy()
        expect(pageTitle.innerHTML).toBe('<i>Giraffe</i> (album)')
      })
    })

    describe('main page display title', () => {
      test(`zimcheck for ${outFiles[0].renderer} renderer`, async () => {
        await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
      })

      test(`test page path for ${outFiles[0].renderer} renderer`, async () => {
        expect(mainPagePageMetaData).toMatch(/path:\s*Main_Page/g)
      })

      test(`test page title for ${outFiles[0].renderer} renderer`, async () => {
        expect(mainPagePageMetaData).toMatch(/title:\s*Main Page/g)
      })

      test(`test page header for ${outFiles[0].renderer} renderer`, async () => {
        const pageTitle = mainPagePageDoc.querySelector('h1#firstHeading')
        expect(pageTitle).toBeTruthy()
        expect((pageTitle as HTMLElement).style.display).toBe('none')
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
