import { testAllRenders } from '../testRenders.js'
import domino from 'domino'
import { zimdump, zimcheck } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'

jest.setTimeout(60000)

// Check the integrity of img elements between ZIM file and article html taken from it
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
  articleList: 'Providence/Stoughton Line', // use article with a slash in its name to check relative links are properly handled
  adminEmail: 'test@kiwix.org',
}

await testAllRenders('en-wikipedia', parameters, async (outFiles) => {
  const articleFromDump = await zimdump(`show --url ${parameters.articleList.replace(' ', '_')} ${outFiles[0].outFile}`)
  describe('e2e test for en.wikipedia.org', () => {
    const articleDoc = domino.createDocument(articleFromDump)

    test(`test ZIM integrity for ${outFiles[0]?.renderer} renderer`, async () => {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
    })

    test(`test article header for ${outFiles[0]?.renderer} renderer`, async () => {
      expect(articleDoc.querySelector('h1#firstHeading, h1.article-header, h1.pcs-edit-section-title')).toBeTruthy()
    })

    test(`test article <body> CSS class for ${outFiles[0]?.renderer} renderer`, async () => {
      // This is implemented correctly only with ActionParse renderer for now
      if (outFiles[0]?.renderer !== 'ActionParse') {
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
      expect(articleDoc.body.className.split(' ').sort()).toEqual(expectedClasses)
    })

    test(`test article <html> CSS class for ${outFiles[0]?.renderer} renderer`, async () => {
      // This is implemented correctly only with ActionParse renderer for now
      if (outFiles[0]?.renderer !== 'ActionParse') {
        return
      }
      const expectedClasses = [
        'client-nojs',
        'skin-theme-clientpref-os',
        'vector-feature-appearance-pinned-clientpref-0',
        'vector-feature-custom-font-size-clientpref-1',
        'vector-feature-language-in-header-enabled',
        'vector-feature-language-in-main-page-header-disabled',
        'vector-feature-limited-width-clientpref-1',
        'vector-feature-limited-width-content-enabled',
        'vector-feature-main-menu-pinned-disabled',
        'vector-feature-night-mode-enabled',
        'vector-feature-page-tools-pinned-disabled',
        'vector-feature-toc-pinned-clientpref-0',
        'vector-sticky-header-enabled',
        'vector-toc-not-available',
      ].sort()
      expect(articleDoc.documentElement.className.split(' ').sort()).toEqual(expectedClasses)
    })

    test(`test article image integrity for ${outFiles[0]?.renderer} renderer`, async () => {
      const allFiles = await zimdump(`list ${outFiles[0].outFile}`)
      const allFilesArr = allFiles.split('\n')
      const imgFilesArr = allFilesArr.filter((elem) => elem.endsWith('pdf') || elem.endsWith('png') || elem.endsWith('jpg'))
      const imgElements = Array.from(articleDoc.querySelectorAll('img'))
      expect(verifyImgElements(imgFilesArr, imgElements)).toBe(true)
    })

    test(`test redirect without fragment ${outFiles[0]?.renderer} renderer`, async () => {
      // "Providence_Line" should be a redirect to "Providence/Stoughton_Line"
      const redirectInfo = await zimdump(`list --details --url Providence_Line ${outFiles[0].outFile}`)

      expect(redirectInfo).toMatch(/path:\s*Providence_Line/)
      expect(redirectInfo).toMatch(/title:\s*Providence Line/)
      expect(redirectInfo).toMatch(/type:\s*redirect/)
      const redirectIndexMatch = redirectInfo.match(/redirect index:\s*(\d+)/)
      expect(redirectIndexMatch).not.toBe(null)
      const redirectIndex = redirectIndexMatch ? parseInt(redirectIndexMatch[1], 10) : null
      expect(redirectIndex).not.toBeNull()

      const redirectTargetInfo = await zimdump(`list --details --idx ${redirectIndex} ${outFiles[0].outFile}`)
      expect(redirectTargetInfo).toMatch(/path:\s*Providence\/Stoughton_Line/)
      expect(redirectTargetInfo).toMatch(/title:\s*Providence\/Stoughton Line/)
      expect(redirectTargetInfo).toMatch(/type:\s*item/)
    })

    test(`test redirect with fragment ${outFiles[0]?.renderer} renderer`, async () => {
      // "Attleboro_Line" should be an HTML item which will redirect to "Providence/Stoughton_Line#Ownership_and_financing"
      // through http-equiv="refresh"
      const redirectInfo = await zimdump(`list --details --url Attleboro_Line ${outFiles[0].outFile}`)

      expect(redirectInfo).toMatch(/path:\s*Attleboro_Line/)
      expect(redirectInfo).toMatch(/title:\s*Attleboro Line/)
      expect(redirectInfo).toMatch(/type:\s*item/)

      const redirectFromDump = await zimdump(`show --url Attleboro_Line ${outFiles[0].outFile}`)
      expect(redirectFromDump).toContain('<title>Attleboro Line</title>')
      expect(redirectFromDump).toContain('<meta http-equiv="refresh" content="0;URL=\'./Providence/Stoughton_Line#Ownership_and_financing\'" />')
      expect(redirectFromDump).toContain('<a href="./Providence/Stoughton_Line#Ownership_and_financing">Attleboro Line</a>')
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  })
})
