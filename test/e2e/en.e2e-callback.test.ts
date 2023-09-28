import domino from 'domino'
import rimraf from 'rimraf'
import testWithAllRenders from '../testAllRendersTemplateCallback.js'

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  articleList: 'BMW',
  format: '',
}

// Check the integrity of img elements between zim file and article html taken from it
const verifyImgElements = (imgFilesArr: string[], imgElements: DominoElement[]) => {
  for (const img of imgElements) {
    for (const imgFile of imgFilesArr) {
      if (img.getAttribute('src').includes(imgFile)) {
        return true
      }
    }
  }
  return false
}

test('testing e2e callback', (done) => {
  async function callback(data) {
    try {
      data.outFilesArr.forEach(async (outFile) => {
        const articleFromDump = await data.zimdump(`show --url A/${parameters.articleList} ${outFile[0].outFile}`)
        const articleDoc = domino.createDocument(articleFromDump)

        // TODO: test collapsible sections

        // Test page header title
        expect(articleDoc.querySelector('h1.article-header')).toBeTruthy()

        // Check media files
        const mediaFiles = await data.zimdump(`list --ns I ${outFile[0].outFile}`)
        const mediaFilesArr = mediaFiles.split('\n')
        const imgFilesArr = mediaFilesArr.filter((elem) => elem.endsWith('pdf') || elem.endsWith('png') || elem.endsWith('jpg'))
        const imgElements = Array.from(articleDoc.querySelectorAll('img'))

        expect(verifyImgElements(imgFilesArr, imgElements)).toBe(true)

        rimraf.sync(`./${outFile[0].testId}`)

        done()
      })
    } catch (err) {
      throw new Error(err)
    }
  }
  testWithAllRenders(callback, parameters)
})
