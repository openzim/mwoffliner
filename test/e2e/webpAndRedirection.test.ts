import { execa } from 'execa'
import { join } from 'path'
import * as MwOffliner from '../../src/mwoffliner.lib.js'
import { writeFilePromise, mkdirPromise } from '../../src/util/index.js'
import { Archive } from '@openzim/libzim'
import * as FileType from 'file-type'
import { rimraf } from 'rimraf'
import { jest } from '@jest/globals'

jest.setTimeout(200000)

const now = new Date()
const testId = join(process.cwd(), `mwo-test-${+now}`)

const pageListUrl = join(testId, '/pageList')

test('Webp Option check', async () => {
  await execa('redis-cli flushall', { shell: true })
  await mkdirPromise(testId)

  const pageList = `
Animation
Real-time computer graphics`

  await writeFilePromise(pageListUrl, pageList, 'utf8')

  const outFiles = await MwOffliner.execute({
    mwUrl: 'https://en.wikipedia.org',
    adminEmail: 'test@kiwix.org',
    pageList: pageListUrl,
    outputDirectory: testId,
    redis: process.env.REDIS,
    webp: true,
  })

  const zimFile = new Archive(outFiles[0].outFile)

  // passed test for png
  expect(await isWebpPresent('d1f33b1cb42dc60ec0e42c6954875701/Animexample3edit.png', zimFile)).toBeTruthy()
  // passed test for jpg
  expect(await isWebpPresent('d1f33b1cb42dc60ec0e42c6954875701/Claychick.jpg', zimFile)).toBeTruthy()
  // redirection check successful
  expect(await isRedirectionPresent('href="Real-time_rendering"', zimFile)).toBeTruthy()
  rimraf.sync(testId)
})

async function isWebpPresent(path: string, zimFile: Archive) {
  return (await FileType.fileTypeFromBuffer(zimFile.getEntryByPath(`_assets_/${path}`).getItem().data.data))?.mime === 'image/webp'
}

async function isRedirectionPresent(path: string, zimFile: Archive) {
  return zimFile.getEntryByPath('Animation').getItem().data.data.includes(path)
}
