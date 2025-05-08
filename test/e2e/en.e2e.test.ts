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
  articleList: 'BMW',
  adminEmail: 'test@kiwix.org',
}

await testAllRenders('en-wikipedia', parameters, async (outFiles) => {
  const articleFromDump = await zimdump(`show --url ${parameters.articleList} ${outFiles[0].outFile}`)
  describe('e2e test for en.wikipedia.org', () => {
    const articleDoc = domino.createDocument(articleFromDump)

    test(`test ZIM integrity for ${outFiles[0]?.renderer} renderer`, async () => {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
    })

    test(`test article header for ${outFiles[0]?.renderer} renderer`, async () => {
      expect(articleDoc.querySelector('h1.firstHeading > span#openzim-page-title, h1.article-header, h1.pcs-edit-section-title')).toBeTruthy()
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
