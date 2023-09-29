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

// TODO: Jest requires that tests within a describe block be defined synchronously, no async () functions in callback
describe('e2e test for en.wikipedia.org', () => {
  test('Test article structure', async () => {
    const mwUrl = 'https://en.wikipedia.org'
    const articleList = 'User:Kelson/MWoffliner_CI_reference'
    const format = ''
    await testAllRenders(mwUrl, articleList, format, async (outFiles) => {
      /*
        TODO:
        We have to call expect() here in a callback but without test('', () => {...})
        Otherwise, receive Error: Tests cannot be nested. Test "some test" cannot run because it is nested within "Test article structure".
        Uncomment code below to see the issue
      */
      /*
      test('some test', () => {
        expect(1).toBe(1)
      })
      */
      const articleFromDump = await zimdump(`show --url A/${articleList} ${outFiles[0].outFile}`)
      const articleDoc = domino.createDocument(articleFromDump)
      expect(articleDoc.querySelector('h1.article-header')).toBeTruthy()
      const mediaFiles = await zimdump(`list --ns I ${outFiles[0].outFile}`)
      const mediaFilesArr = mediaFiles.split('\n')
      const imgFilesArr = mediaFilesArr.filter((elem) => elem.endsWith('pdf') || elem.endsWith('png') || elem.endsWith('jpg'))
      const imgElements = Array.from(articleDoc.querySelectorAll('img'))
      expect(verifyImgElements(imgFilesArr, imgElements)).toBe(true)
      rimraf.sync(`./${outFiles[0].testId}`)
    })
  })
})
