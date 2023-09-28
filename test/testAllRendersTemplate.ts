import * as mwoffliner from '../src/mwoffliner.lib.js'
import domino from 'domino'
import { execa } from 'execa'
import rimraf from 'rimraf'
import { jest } from '@jest/globals'
import { RENDERERS_LIST } from '../src/util/const.js'
import { zimcheckAvailable, zimdumpAvailable, zimcheck, zimdump } from './util.js'
import 'dotenv/config.js'

jest.setTimeout(200000)

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

async function getOutFiles(renderName: string, testId: string, articleList: string, mwUrl: string, format?: string): Promise<any> {
  const parameters = {
    mwUrl,
    adminEmail: 'test@kiwix.org',
    outputDirectory: testId,
    redis: process.env.REDIS,
    articleList,
    forceRender: renderName,
    format,
  }

  await execa('redis-cli flushall', { shell: true })
  const outFiles = await mwoffliner.execute(parameters)

  return outFiles
}

const testWithAllRenders = async (mwUrl: string, articleList: string, format?: string) => {
  const zimcheckIsAvailable = await zimcheckAvailable()
  const zimdumpIsAvailable = await zimdumpAvailable()

  if (!zimcheckIsAvailable || !zimdumpIsAvailable) {
    const missingTool = !zimcheckIsAvailable ? 'Zimcheck' : 'Zimdump'
    console.log(`${missingTool} not installed, skipping test`)
    return
  }

  for (const renderer of RENDERERS_LIST) {
    const now = new Date()
    const testId = `mwo-test-${+now}`

    const outFiles = await getOutFiles(renderer, testId, articleList, mwUrl, format)
    await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()

    const articleFromDump = await zimdump(`show --url A/${articleList} ${outFiles[0].outFile}`)
    const articleDoc = domino.createDocument(articleFromDump)

    // TODO: test collapsible sections

    // Test page header title
    expect(articleDoc.querySelector('h1.article-header')).toBeTruthy()

    // Check media files
    const mediaFiles = await zimdump(`list --ns I ${outFiles[0].outFile}`)
    const mediaFilesArr = mediaFiles.split('\n')
    const imgFilesArr = mediaFilesArr.filter((elem) => elem.endsWith('pdf') || elem.endsWith('png') || elem.endsWith('jpg'))
    const imgElements = Array.from(articleDoc.querySelectorAll('img'))

    expect(verifyImgElements(imgFilesArr, imgElements)).toBe(true)

    rimraf.sync(`./${testId}`)
  }
}

export default testWithAllRenders
