import 'dotenv/config.js'
import * as mwoffliner from '../../src/mwoffliner.lib.js'
import domino from 'domino'
import rimraf from 'rimraf'
import { execa } from 'execa'
import { jest } from '@jest/globals'
import { renderers } from './rendererList.js'
import { zimcheckAvailable, zimdumpAvailable, zimcheck, zimdump } from '../util.js'

jest.setTimeout(200000)

let zimcheckIsAvailable
let zimdumpIsAvailable

beforeAll(async () => {
  zimcheckIsAvailable = await zimcheckAvailable()
  zimdumpIsAvailable = await zimdumpAvailable()
})

const setDefaultParams = (renderName: string, testId: string) => {
  return {
    mwUrl: 'https://en.wikipedia.org',
    adminEmail: 'test@kiwix.org',
    outputDirectory: testId,
    redis: process.env.REDIS,
    articleList: 'User:Kelson/MWoffliner_CI_reference',
    forceRender: renderName,
  }
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

const commonTreatmentTest = async (renderer) => {
  if (!zimcheckIsAvailable) {
    console.log('Zimcheck not installed, skipping test')
    return
  }
  if (!zimdumpIsAvailable) {
    console.log('Zimcdump not installed, skipping test')
    return
  }
  const now = new Date()
  const testId = `mwo-test-${+now}`

  const parameters = setDefaultParams(renderer, testId)
  await execa('redis-cli flushall', { shell: true })
  const outFiles = await mwoffliner.execute(parameters)
  await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()

  const articleFromDump = await zimdump(`show --url A/${parameters.articleList} ${outFiles[0].outFile}`)
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

describe('Treatments e2e', () => {
  for (const renderer of renderers) {
    if (renderer === 'WikimediaDesktop') {
      test('WikimediaDesktop e2e', async () => {
        await commonTreatmentTest(renderer)
      })
    }
    if (renderer === 'VisualEditor') {
      test('VisualEditor e2e', async () => {
        await commonTreatmentTest(renderer)
      })
    }
  }
})
