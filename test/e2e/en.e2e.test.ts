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
      expect(articleDoc.querySelector('h1.firstHeading > span#openzim-page-title, h1.article-header, h1.pcs-edit-section-title')).toBeTruthy()
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
        'vector-feature-appearance-pinned-clientpref-1',
        'vector-feature-custom-font-size-clientpref-1',
        'vector-feature-language-in-header-enabled',
        'vector-feature-language-in-main-page-header-disabled',
        'vector-feature-limited-width-clientpref-1',
        'vector-feature-limited-width-content-enabled',
        'vector-feature-main-menu-pinned-disabled',
        'vector-feature-night-mode-disabled',
        'vector-feature-page-tools-pinned-disabled',
        'vector-feature-toc-pinned-clientpref-1',
        'vector-sticky-header-enabled',
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

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  })
})
