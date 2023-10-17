import { execa } from 'execa'
import { join } from 'path'
import * as MwOffliner from '../../src/mwoffliner.lib.js'
import { writeFilePromise, mkdirPromise, isWebpCandidateImageMimeType, getMimeType } from '../../src/util/index.js'
import { ZimReader } from '@openzim/libzim'
import * as FileType from 'file-type'
import rimraf from 'rimraf'
import { jest } from '@jest/globals'

jest.setTimeout(30000)

const now = new Date()
const testId = join(process.cwd(), `mwo-test-${+now}`)

const articleListUrl = join(testId, '/articleList')

const isWebpCandidateImageUrl = (url) => {
  return isWebpCandidateImageMimeType(true, getMimeType(url))
}

test('Webp Option check', async () => {
  await execa('redis-cli flushall', { shell: true })
  await mkdirPromise(testId)

  const articleList = `
Animation
Real-time computer graphics`

  await writeFilePromise(articleListUrl, articleList, 'utf8')

  const outFiles = await MwOffliner.execute({
    mwUrl: 'https://en.wikipedia.org',
    adminEmail: 'test@kiwix.org',
    articleList: articleListUrl,
    outputDirectory: testId,
    redis: process.env.REDIS,
    webp: true,
    forceRender: 'WikimediaDesktop',
  })

  const zimFile = new ZimReader(outFiles[0].outFile)

  // detecting webp URL having png before arguments
  expect(isWebpCandidateImageUrl('../I/osm-intl%2C9%2C52.2789%2C8.0431%2C300x300.png?lang.svg')).toBeTruthy()
  // detecting webp URL having jpg before arguments
  expect(isWebpCandidateImageUrl('../I/osm-intl%2C9%2C52.2789%2C8.0431%2C300x300.jpg?lang.svg')).toBeTruthy()
  // detecting webp URL having jpeg before arguments
  expect(isWebpCandidateImageUrl('../I/osm-intl%2C9%2C52.2789%2C8.0431%2C300x300.jpeg?lang.svg')).toBeTruthy()
  // avoiding detecting webp URL having an escaped question marked
  expect(!isWebpCandidateImageUrl('../I/osm-intl%2C9%2C52.2789%2C8.0431%2C300x300.jpeg%3Flang.svg')).toBeTruthy()
  // detecting webp URL having png at last
  expect(isWebpCandidateImageUrl('../I/osm-intl%2C9%2C52.2789%2C8.0431%2C300x300.png')).toBeTruthy()
  // detecting webp URL having jpg at last
  expect(isWebpCandidateImageUrl('../I/osm-intl%2C9%2C52.2789%2C8.0431%2C300x300.jpg')).toBeTruthy()
  // detecting webp URL having jpeg at last
  expect(isWebpCandidateImageUrl('../I/osm-intl%2C9%2C52.2789%2C8.0431%2C300x300.jpeg')).toBeTruthy()

  // passed test for png
  expect(await isWebpPresent('I/Animexample3edit.png.webp', zimFile)).toBeTruthy()
  // passed test for jpg
  expect(await isWebpPresent('I/Claychick.jpg.webp', zimFile)).toBeTruthy()
  // redirection check successful
  expect(await isRedirectionPresent('href="Real-time_rendering"', zimFile)).toBeTruthy()
  rimraf.sync(testId)
})

async function isWebpPresent(path: string, zimFile: ZimReader) {
  return zimFile
    .getArticleByUrl(path)
    .then(async (result) => {
      return (await FileType.fileTypeFromBuffer(result.data))?.mime === 'image/webp'
    })
    .catch(() => {
      return false
    })
}

async function isRedirectionPresent(path: string, zimFile: ZimReader) {
  return zimFile.getArticleByUrl('A/Animation').then((result) => {
    return result.data.toString().includes(path)
  })
}
