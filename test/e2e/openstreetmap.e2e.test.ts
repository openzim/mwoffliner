import { testRenders } from '../testRenders.js'
import domino from 'domino'
import { zimdump } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import rimraf from 'rimraf'

jest.setTimeout(60000)

// Check the integrity of img elements between zim file and article html taken from it
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
  articleList: 'London',
  adminEmail: 'test@kiwix.org',
}

await testRenders(
  parameters,
  async (outFiles) => {
    const articleFromDump = await zimdump(`show --url A/${parameters.articleList} ${outFiles[0].outFile}`)
    describe('e2e test for wiki.openstreetmap.org', () => {
      const articleDoc = domino.createDocument(articleFromDump)
      // TODO: blocked by issues/1931
      /*
      test(`test zim integrity for ${outFiles[0]?.renderer} renderer`, async () => {
        await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
      })
      */
      test(`test article header for ${outFiles[0]?.renderer} renderer`, async () => {
        expect(articleDoc.querySelector('h1.article-header, h1.pcs-edit-section-title')).toBeTruthy()
      })
      test(`test article image integrity for ${outFiles[0]?.renderer} renderer`, async () => {
        const mediaFiles = await zimdump(`list --ns I ${outFiles[0].outFile}`)
        const mediaFilesArr = mediaFiles.split('\n')
        const imgFilesArr = mediaFilesArr.filter((elem) => elem.endsWith('pdf') || elem.endsWith('png') || elem.endsWith('jpg'))
        const imgElements = Array.from(articleDoc.querySelectorAll('img'))
        expect(verifyImgElements(imgFilesArr, imgElements)).toBe(true)
      })

      afterAll(() => {
        rimraf.sync(`./${outFiles[0].testId}`)
      })
    })
  },
  ['MediawikiRestApi'],
)
