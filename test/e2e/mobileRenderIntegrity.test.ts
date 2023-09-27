import 'dotenv/config.js'
import * as mwoffliner from '../../src/mwoffliner.lib.js'
import rimraf from 'rimraf'
import { execa } from 'execa'
import { jest } from '@jest/globals'
import { zimcheckAvailable, zimdumpAvailable, zimcheck } from '../util.js'

jest.setTimeout(200000)

let zimcheckIsAvailable
let zimdumpIsAvailable

beforeAll(async () => {
  zimcheckIsAvailable = await zimcheckAvailable()
  zimdumpIsAvailable = await zimdumpAvailable()
})

async function getOutFiles(testId: string, articleList: string, mwUrl: string): Promise<any> {
  const parameters = {
    mwUrl,
    adminEmail: 'mail@mail.com',
    outputDirectory: testId,
    redis: process.env.REDIS,
    articleList,
    forceRender: 'WikimediaMobile',
  }

  await execa('redis-cli flushall', { shell: true })
  const outFiles = await mwoffliner.execute(parameters)

  return outFiles
}

const commonTreatmentTest = async (articleList: string, mwUrl: string) => {
  if (!zimcheckIsAvailable || !zimdumpIsAvailable) {
    const missingTool = !zimcheckIsAvailable ? 'Zimcheck' : 'Zimdump'
    console.log(`${missingTool} not installed, skipping test`)
    return
  }
  const now = new Date()
  const testId = `mwo-test-${+now}`

  const outFiles = await getOutFiles(testId, articleList, mwUrl)
  await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()

  rimraf.sync(`./${testId}`)
}

describe('Mobile render zim file integrity', () => {
  const mwUrl = 'https://en.wikipedia.org'
  // TODO: some articles such as 'Canada' don't pass this test even with desktop renderer
  const articleList = 'BMW'

  test('Test WikimediaMobile with en.wikipedia.org', async () => {
    await commonTreatmentTest(articleList, mwUrl)
  })
})
