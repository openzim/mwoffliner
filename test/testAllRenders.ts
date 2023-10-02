import * as logger from '../src/Logger.js'
import * as mwoffliner from '../src/mwoffliner.lib.js'
import { execa } from 'execa'
import { RENDERERS_LIST } from '../src/util/const.js'
import { zimcheckAvailable, zimdumpAvailable } from './util.js'

/*
  This is the template for e2e tests of different wikis
  1. Verify zimcheck and zimdump availability
  2. Gets output file and checks its integrity
  3. Returns output file per renderer in the callback function
*/

async function getOutFiles(renderName: string, testId: string, articleList: string, mwUrl: string, format?: string | string[]): Promise<any> {
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

export async function testAllRenders(mwUrl: string, articleList: string, format: string | string[], callback) {
  const zimcheckIsAvailable = await zimcheckAvailable()
  const zimdumpIsAvailable = await zimdumpAvailable()

  if (!zimcheckIsAvailable || !zimdumpIsAvailable) {
    const missingTool = !zimcheckIsAvailable ? 'Zimcheck' : 'Zimdump'
    logger.error(`${missingTool} not installed, exiting test`)
    process.exit(1)
  }

  for (const renderer of RENDERERS_LIST) {
    const now = new Date()
    const testId = `mwo-test-${+now}`
    const outFiles = await getOutFiles(renderer, testId, articleList, mwUrl, format)
    outFiles[0].testId = testId
    outFiles[0].renderer = renderer
    await callback(outFiles)
  }
}
