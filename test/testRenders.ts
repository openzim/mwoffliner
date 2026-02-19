import * as logger from '../src/Logger.js'
import * as mwoffliner from '../src/mwoffliner.lib.js'
import { execa } from 'execa'
import { RENDERERS_LIST } from '../src/util/const.js'
import { zimcheckAvailable, zimdumpAvailable } from './util.js'
import { Dump } from '../src/Dump.js'

interface Parameters {
  mwUrl: string
  adminEmail: string
  outputDirectory?: string
  addNamespaces?: number
  articleList?: string
  articleListToIgnore?: string
  redis?: string
  format?: string | string[]
  noLocalParserFallback?: boolean
  forceRender?: string
  mwActionApiPath?: string
  mwModulePath?: string
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

async function getOutFiles(renderName: string, testId: string, parameters: Parameters): Promise<Dump[]> {
  await execa('redis-cli flushall', { shell: true })
  const outFiles = await mwoffliner.execute({ ...parameters, outputDirectory: testId, forceRender: renderName })

  return outFiles
}

interface TestDump extends Dump {
  testId: string
  renderer: string
}

export async function testRenders(testName: string, parameters: Parameters, callback: { (outFiles: TestDump[]): any }, renderersList: Array<string>) {
  await checkZimTools()
  for (const renderer of renderersList) {
    try {
      const now = new Date()
      const testId = `mwo-test-${testName}-${renderer}-${+now}`
      const outFiles = (await getOutFiles(renderer, testId, parameters)) as TestDump[]
      outFiles[0].testId = testId
      outFiles[0].renderer = renderer
      await callback(outFiles)
    } catch (err) {
      logger.error(err.message)
      return
    }
  }
}

export async function testAllRenders(testName: string, parameters: Parameters, callback: { (outFiles: TestDump[]): any }) {
  return testRenders(testName, parameters, callback, RENDERERS_LIST)
}
