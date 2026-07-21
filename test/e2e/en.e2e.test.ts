import { testAllRenders, TestDump } from '../testRenders.js'
import domino from 'domino'
import { zimdump, zimcheck } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'

jest.setTimeout(60000)

// Check the integrity of img elements between ZIM file and page html taken from it
const verifyImgElements = (imgFilesArr, imgElements) => {
  for (const img of imgElements) {
    for (const imgFile of imgFilesArr) {
      if (img.getAttribute('src').includes(imgFile)) {
        return true
      }
    }
  }
  return false
}

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  pageList: 'Providence/Stoughton Line', // use page with a slash in its name to check relative links are properly handled
  adminEmail: 'test@kiwix.org',
  format: ['', 'nopic,nodet:mini'],
  //format: ['nopic,nodet:mini'],
}

const dumpName = (dump: TestDump) => {
  return dump.nodet ? 'mini' : 'full'
}

await testAllRenders('en-wikipedia', parameters, async (outFiles) => {
  const pagesFromDump = await Promise.all(outFiles.map((dump) => zimdump(`show --url ${parameters.pageList.replace(' ', '_')} ${dump.outFile}`)))
  const filesInDump = await Promise.all(outFiles.map(async (dump) => (await zimdump(`list ${dump.outFile}`)).split('\n')))

  describe('e2e test for en.wikipedia.org', () => {
    test(`test number of ZIMs for ${outFiles[0]?.renderer} renderer`, async () => {
      await expect(outFiles.length).toBe(2)
    })

    for (const [index, dump] of outFiles.entries()) {
      const pageDoc = domino.createDocument(pagesFromDump[index])
      const allFilesArr = filesInDump[index]

      test(`test ZIM integrity for ${outFiles[0]?.renderer} renderer and ${dumpName(dump)} ZIM`, async () => {
        await expect(zimcheck(dump.outFile)).resolves.not.toThrow()
      })

      test(`test page header for ${outFiles[0]?.renderer} renderer and ${dumpName(dump)} ZIM`, async () => {
        expect(pageDoc.querySelector('h1#firstHeading, h1.page-header, h1.pcs-edit-section-title')).toBeTruthy()
      })

      test(`test page <body> CSS class for ${outFiles[0]?.renderer} renderer and ${dumpName(dump)} ZIM`, async () => {
        // This is implemented correctly only with ActionParse renderer for now
        if (dump.renderer !== 'ActionParse') {
          return
        }
        const expectedClasses = [
          'action-view',
          'ltr',
          'mediawiki',
          'mw-hide-empty-elt',
          'ns-0',
          'ns-subject',
          'page-Providence_Stoughton_Line',
          'rootpage-Providence_Stoughton_Line',
          'sitedir-ltr',
          'skin--responsive',
          'skin-vector',
          'skin-vector-2022',
          'skin-vector-search-vue',
        ].sort()
        expect(pageDoc.body.className.split(' ').sort()).toEqual(expectedClasses)
      })

      test(`test page <html> CSS class for ${outFiles[0]?.renderer} renderer and ${dumpName(dump)} ZIM`, async () => {
        // This is implemented correctly only with ActionParse renderer for now
        if (dump.renderer !== 'ActionParse') {
          return
        }
        const expectedClasses = [
          'client-nojs',
          'skin-theme-clientpref-os',
          'skin-thumbsize-clientpref-standard',
          'vector-feature-appearance-pinned-clientpref-0',
          'vector-feature-custom-font-size-clientpref-1',
          'vector-feature-language-in-header-enabled',
          'vector-feature-language-in-main-menu-disabled',
          'vector-feature-language-in-main-page-header-disabled',
          'vector-feature-limited-width-clientpref-1',
          'vector-feature-limited-width-content-enabled',
          'vector-feature-main-menu-pinned-disabled',
          'vector-feature-navigation-update-disabled',
          'vector-feature-page-tools-pinned-disabled',
          'vector-feature-toc-pinned-clientpref-0',
          'vector-sticky-header-enabled',
          'vector-toc-not-available',
        ].sort()
        expect(pageDoc.documentElement.className.split(' ').sort()).toEqual(expectedClasses)
      })

      if (!dump.nopic) {
        test(`test page image integrity for ${outFiles[0]?.renderer} renderer and ${dumpName(dump)} ZIM`, async () => {
          const imgFilesArr = allFilesArr.filter((elem) => elem.endsWith('pdf') || elem.endsWith('png') || elem.endsWith('jpg'))
          const imgElements = Array.from(pageDoc.querySelectorAll('img'))
          expect(verifyImgElements(imgFilesArr, imgElements)).toBe(true)
        })
      }

      test(`test redirect without fragment ${outFiles[0]?.renderer} renderer and ${dumpName(dump)} ZIM`, async () => {
        // "Providence_Line" should be a redirect to "Providence/Stoughton_Line"
        const redirectInfo = await zimdump(`list --details --url Providence_Line ${dump.outFile}`)

        expect(redirectInfo).toMatch(/path:\s*Providence_Line/)
        expect(redirectInfo).toMatch(/title:\s*Providence Line/)
        expect(redirectInfo).toMatch(/type:\s*redirect/)
        const redirectIndexMatch = redirectInfo.match(/redirect index:\s*(\d+)/)
        expect(redirectIndexMatch).not.toBe(null)
        const redirectIndex = redirectIndexMatch ? parseInt(redirectIndexMatch[1], 10) : null
        expect(redirectIndex).not.toBeNull()

        const redirectTargetInfo = await zimdump(`list --details --idx ${redirectIndex} ${dump.outFile}`)
        expect(redirectTargetInfo).toMatch(/path:\s*Providence\/Stoughton_Line/)
        expect(redirectTargetInfo).toMatch(/title:\s*Providence\/Stoughton Line/)
        expect(redirectTargetInfo).toMatch(/type:\s*item/)
      })

      test(`test redirect with fragment ${outFiles[0]?.renderer} renderer and ${dumpName(dump)} ZIM`, async () => {
        if (dump.nodet) {
          // Redirect with fragment are ignored in nodet
          expect(allFilesArr).not.toContain('Attleboro_Line')
        } else {
          // "Attleboro_Line" should be an HTML item which will redirect to "Providence/Stoughton_Line#Ownership_and_financing"
          // through http-equiv="refresh"
          expect(allFilesArr).toContain('Attleboro_Line')
          const redirectInfo = await zimdump(`list --details --url Attleboro_Line ${dump.outFile}`)

          expect(redirectInfo).toMatch(/path:\s*Attleboro_Line/)
          expect(redirectInfo).toMatch(/title:\s*Attleboro Line/)
          expect(redirectInfo).toMatch(/type:\s*item/)

          const redirectFromDump = await zimdump(`show --url Attleboro_Line ${dump.outFile}`)
          expect(redirectFromDump).toContain('<title>Attleboro Line</title>')
          expect(redirectFromDump).toContain('<meta http-equiv="refresh" content="0;URL=\'./Providence/Stoughton_Line#Ownership_and_financing\'" />')
          expect(redirectFromDump).toContain('<a href="./Providence/Stoughton_Line#Ownership_and_financing">Attleboro Line</a>')
        }
      })

      afterAll(() => {
        if (!process.env.KEEP_ZIMS) {
          rimraf.sync(`./${dump.testId}`)
        }
      })
    }
  })
})
