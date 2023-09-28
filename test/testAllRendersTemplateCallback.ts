import * as mwoffliner from '../src/mwoffliner.lib.js'
import { jest } from '@jest/globals'
import { RENDERERS_LIST } from '../src/util/const.js'
import { zimcheckAvailable, zimdumpAvailable, zimcheck, zimdump } from './util.js'
import 'dotenv/config.js'
import { execa } from 'execa'

jest.setTimeout(200000)

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

const testWithAllRenders = async (back, parameters) => {
  const zimcheckIsAvailable = await zimcheckAvailable()
  const zimdumpIsAvailable = await zimdumpAvailable()
  const outFilesArr = []

  if (!zimcheckIsAvailable || !zimdumpIsAvailable) {
    const missingTool = !zimcheckIsAvailable ? 'Zimcheck' : 'Zimdump'
    console.log(`${missingTool} not installed, skipping test`)
    return
  }

  for (const renderer of RENDERERS_LIST) {
    const now = new Date()
    const testId = `mwo-test-${+now}`
    const outFiles = await getOutFiles(renderer, testId, parameters.articleList, parameters.mwUrl, parameters.format)
    await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
    // Update outFiles dump with the renderer info and testId as we need them for futher testing
    outFiles[0].testId = testId
    outFiles[0].renderer = renderer
    outFilesArr.push(outFiles)
  }
  return back({ outFilesArr, zimdump })
}

export default testWithAllRenders
