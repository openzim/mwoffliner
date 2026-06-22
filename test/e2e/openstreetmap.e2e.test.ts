import { testAllRenders } from '../testRenders.js'
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
  mwUrl: 'https://wiki.openstreetmap.org',
  pageList: 'London',
  adminEmail: 'test@kiwix.org',
}

await testAllRenders('openstreetmap', parameters, async (outFiles) => {
  const pageFromDump = await zimdump(`show --url ${parameters.pageList} ${outFiles[0].outFile}`)
  describe('e2e test for wiki.openstreetmap.org', () => {
    const pageDoc = domino.createDocument(pageFromDump)

    test(`test ZIM integrity for ${outFiles[0]?.renderer} renderer`, async () => {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
    })

    test(`test page header for ${outFiles[0]?.renderer} renderer`, async () => {
      expect(pageDoc.querySelector('h1#firstHeading, h1.page-header, h1.pcs-edit-section-title')).toBeTruthy()
    })
    test(`test page image integrity for ${outFiles[0]?.renderer} renderer`, async () => {
      const allFiles = await zimdump(`list ${outFiles[0].outFile}`)
      const allFilesArr = allFiles.split('\n')
      const imgFilesArr = allFilesArr.filter((elem) => elem.endsWith('pdf') || elem.endsWith('png') || elem.endsWith('jpg'))
      const imgElements = Array.from(pageDoc.querySelectorAll('img'))
      expect(verifyImgElements(imgFilesArr, imgElements)).toBe(true)
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  })
})
