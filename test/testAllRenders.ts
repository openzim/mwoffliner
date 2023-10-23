import * as logger from '../src/Logger.js'
import * as mwoffliner from '../src/mwoffliner.lib.js'
import { execa } from 'execa'
import { RENDERERS_LIST } from '../src/util/const.js'
import { zimcheckAvailable, zimdumpAvailable } from './util.js'

interface Parameters {
  mwUrl: string
  adminEmail: string
  articleList?: string
  articleListToIgnore?: string
  redis?: string
  format?: string | string[]
  noLocalParserFallback?: boolean
  forceRender?: string
}

/*
  This is the template for e2e tests of different wikis
  1. Verify zimcheck and zimdump availability and caches result
  2. Gets output file and checks its integrity
  3. Returns output file per renderer in the callback function
*/

let zimToolsChecked = false
async function checkZimTools() {
  if (zimToolsChecked) {
    return
  }

  const zimcheckIsAvailable = await zimcheckAvailable()
  const zimdumpIsAvailable = await zimdumpAvailable()

  if (!zimcheckIsAvailable || !zimdumpIsAvailable) {
    const missingTool = !zimcheckIsAvailable ? 'Zimcheck' : 'Zimdump'
    logger.error(`${missingTool} not installed, exiting test`)
    process.exit(1)
  }

  zimToolsChecked = true
}

async function getOutFiles(renderName: string, testId: string, parameters: Parameters): Promise<any> {
  await execa('redis-cli flushall', { shell: true })
  const outFiles = await mwoffliner.execute(parameters)

  return outFiles
}

export async function testAllRenders(parameters: Parameters, callback) {
  await checkZimTools()
  for (const renderer of RENDERERS_LIST) {
    const now = new Date()
    const testId = `mwo-test-${+now}`
    const outFiles = await getOutFiles(renderer, testId, parameters)
    outFiles[0].testId = testId
    outFiles[0].renderer = renderer
    await callback(outFiles)
  }
}
