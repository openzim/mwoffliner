import { testAllRenders } from '../testAllRenders.js'
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

const mwUrl = 'https://en.wikipedia.org'
const articleList = 'User:Kelson/MWoffliner_CI_reference'
const format = ''

await testAllRenders(mwUrl, articleList, format, async (outFiles) => {
  const describeIf = outFiles.isSkipped ? describe.skip : describe

  let articleFromDump
  if (!outFiles.isSkipped) {
    articleFromDump = await zimdump(`show --url A/${articleList} ${outFiles[0].outFile}`)
  }

  describeIf('e2e test for en.wikipedia.org', () => {
    const articleDoc = domino.createDocument(articleFromDump)
    test(`test article header for ${outFiles[0]?.renderer} renderer`, async () => {
      expect(articleDoc.querySelector('h1.article-header')).toBeTruthy()
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
})
