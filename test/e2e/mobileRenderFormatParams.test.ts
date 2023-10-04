import 'dotenv/config.js'
import * as mwoffliner from '../../src/mwoffliner.lib.js'
import * as logger from '../../src/Logger.js'
import domino from 'domino'
import rimraf from 'rimraf'
import { execa } from 'execa'
import { jest } from '@jest/globals'
import { zimdumpAvailable, zimdump } from '../util.js'

jest.setTimeout(200000)

let zimdumpIsAvailable

beforeAll(async () => {
  zimdumpIsAvailable = await zimdumpAvailable()
  if (!zimdumpIsAvailable) {
    logger.error('Zimdump not installed, exiting test')
    process.exit(1)
  }
})

async function getOutFiles(testId: string, articleList: string, mwUrl: string, format?: string): Promise<any> {
  const parameters = {
    mwUrl,
    adminEmail: 'mail@mail.com',
    outputDirectory: testId,
    redis: process.env.REDIS,
    articleList,
    forceRender: 'WikimediaMobile',
    format,
  }

  await execa('redis-cli flushall', { shell: true })
  const outFiles = await mwoffliner.execute(parameters)

  return outFiles
}

// TODO: articulate this test with /pull/1898 once merged
describe('Mobile render with multiple format params', () => {
  const mwUrl = 'https://en.wikipedia.org'

  test('Test WikimediaMobile with en.wikipedia.org using format:nopic param', async () => {
    const articleList = 'BMW'
    const now = new Date()
    const testId = `mwo-test-${+now}`

    const outFiles = await getOutFiles(testId, articleList, mwUrl, 'nopic')
    const articleFromDump = await zimdump(`show --url A/${articleList} ${outFiles[0].outFile}`)
    const articleDoc = domino.createDocument(articleFromDump)

    const imgElements = Array.from(articleDoc.querySelectorAll('img'))

    expect(imgElements).toHaveLength(0)

    rimraf.sync(`./${testId}`)
  })

  test('Test WikimediaMobile render with en.wikipedia.org using format:nodet param', async () => {
    const articleList = 'BMW'
    const now = new Date()
    const testId = `mwo-test-${+now}`

    const outFiles = await getOutFiles(testId, articleList, mwUrl, 'nodet')
    const articleFromDump = await zimdump(`show --url A/${articleList} ${outFiles[0].outFile}`)
    const articleDoc = domino.createDocument(articleFromDump)

    const sectionsElements = Array.from(articleDoc.querySelectorAll('section'))

    expect(sectionsElements).toHaveLength(1)
    expect(sectionsElements[0].getAttribute('data-mw-section-id')).toEqual('0')

    rimraf.sync(`./${testId}`)
  })

  test('Test WikimediaMobile render with en.wikipedia.org using format:novid param to check no video tags', async () => {
    const articleList = 'Animation'
    const now = new Date()
    const testId = `mwo-test-${+now}`

    const outFiles = await getOutFiles(testId, articleList, mwUrl, 'novid')
    const articleFromDump = await zimdump(`show --url A/${articleList} ${outFiles[0].outFile}`)
    const articleDoc = domino.createDocument(articleFromDump)

    const videoElements = Array.from(articleDoc.querySelectorAll('video'))

    expect(videoElements).toHaveLength(0)

    rimraf.sync(`./${testId}`)
  })

  test('Test WikimediaMobile render with en.wikipedia.org using format:novid param to check no audio tags', async () => {
    const articleList = 'English_alphabet'
    const now = new Date()
    const testId = `mwo-test-${+now}`

    const outFiles = await getOutFiles(testId, articleList, mwUrl, 'novid')
    const articleFromDump = await zimdump(`show --url A/${articleList} ${outFiles[0].outFile}`)
    const articleDoc = domino.createDocument(articleFromDump)

    const audioElements = Array.from(articleDoc.querySelectorAll('audio'))

    expect(audioElements).toHaveLength(0)

    rimraf.sync(`./${testId}`)
  })

  test.skip('Test WikimediaMobile render with en.wikipedia.org using format:nopdf', async () => {
    const articleList = 'PDF'
    const now = new Date()
    const testId = `mwo-test-${+now}`

    const outFiles = await getOutFiles(testId, articleList, mwUrl, 'nopdf')
    const articleFromDump = await zimdump(`show --url A/${articleList} ${outFiles[0].outFile}`)
    const articleDoc = domino.createDocument(articleFromDump)

    const anchorElements = Array.from(articleDoc.querySelectorAll('a'))

    anchorElements.forEach(() => {
      // TODO: Check valid links to pdf source
    })

    rimraf.sync(`./${testId}`)
  })
})
