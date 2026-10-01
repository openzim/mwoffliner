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

      test(`test html <title> for ${outFiles[0].renderer} renderer`, async () => {
        const htmlTitle = giraffePageDoc.querySelector('title')
        expect(htmlTitle).toBeTruthy()
        expect(htmlTitle.textContent).toBe('Giraffe (album)')
        expect(htmlTitle.innerHTML).not.toMatch(/[<>]/)
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

await testRenders(
  'displayTitle-customMainPage',
  { ...parameters, pageList: 'Giraffe (album),Brian May', customMainPage: 'Giraffe (album)' },
  async (outFiles) => {
    const giraffePageDoc = domino.createDocument(await zimdump(`show --url "Giraffe_(album)" ${outFiles[0].outFile}`))
    const brianMayPageDoc = domino.createDocument(await zimdump(`show --url "Brian_May" ${outFiles[0].outFile}`))

    describe('custom main page display title', () => {
      test(`zimcheck for ${outFiles[0].renderer} renderer`, async () => {
        await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
      })

      test(`custom main page header is hidden for ${outFiles[0].renderer} renderer`, async () => {
        const pageTitle = giraffePageDoc.querySelector('h1#firstHeading')
        expect(pageTitle).toBeTruthy()
        expect((pageTitle as HTMLElement).style.display).toBe('none')
      })

      test(`other page header is not hidden for ${outFiles[0].renderer} renderer`, async () => {
        const pageTitle = brianMayPageDoc.querySelector('h1#firstHeading')
        expect(pageTitle).toBeTruthy()
        expect((pageTitle as HTMLElement).style.display).not.toBe('none')
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

await testRenders(
  'displayTitle-customMainPageSubpage',
  { ...parameters, pageList: 'User:The_other_Kiwix_guy/Landing,User:The_other_Kiwix_guy/Apps', customMainPage: 'User:The_other_Kiwix_guy/Landing' },
  async (outFiles) => {
    const landingPageDoc = domino.createDocument(await zimdump(`show --url "User:The_other_Kiwix_guy/Landing" ${outFiles[0].outFile}`))
    const appsPageDoc = domino.createDocument(await zimdump(`show --url "User:The_other_Kiwix_guy/Apps" ${outFiles[0].outFile}`))

    describe('custom main page which is a subpage', () => {
      test(`zimcheck for ${outFiles[0].renderer} renderer`, async () => {
        await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
      })

      test(`custom main page header is hidden for ${outFiles[0].renderer} renderer`, async () => {
        const pageTitle = landingPageDoc.querySelector('h1#firstHeading')
        expect(pageTitle).toBeTruthy()
        expect((pageTitle as HTMLElement).style.display).toBe('none')
      })

      test(`custom main page subpage breadcrumb is hidden for ${outFiles[0].renderer} renderer`, async () => {
        const pageSubtitle = landingPageDoc.querySelector('#contentSub > #mw-content-subtitle')
        expect(pageSubtitle).toBeTruthy()
        expect(pageSubtitle.innerHTML).toBe('')
      })

      test(`other subpage keeps its breadcrumb for ${outFiles[0].renderer} renderer`, async () => {
        const breadcrumb = appsPageDoc.querySelector('#contentSub > #mw-content-subtitle > .subpages')
        expect(breadcrumb).toBeTruthy()
        expect(breadcrumb.textContent).toContain('User:The other Kiwix guy')
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

await testRenders(
  'displayTitle-singlePage',
  { ...parameters, pageList: 'Giraffe (album)' },
  async (outFiles) => {
    const giraffePageDoc = domino.createDocument(await zimdump(`show --url "Giraffe_(album)" ${outFiles[0].outFile}`))

    describe('single page list display title', () => {
      test(`single page used as ZIM main page keeps its header for ${outFiles[0].renderer} renderer`, async () => {
        const pageTitle = giraffePageDoc.querySelector('h1#firstHeading')
        expect(pageTitle).toBeTruthy()
        expect((pageTitle as HTMLElement).style.display).not.toBe('none')
        expect(pageTitle.innerHTML).toBe('<i>Giraffe</i> (album)')
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
