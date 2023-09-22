import * as mwoffliner from '../../src/mwoffliner.lib.js'
import { zimcheckAvailable, zimcheck } from '../util.js'
import rimraf from 'rimraf'
import { writeFilePromise, mkdirPromise } from '../../src/util/index.js'
import { join } from 'path'
import { execa } from 'execa'
import 'dotenv/config.js'
import { jest } from '@jest/globals'

jest.setTimeout(20000)

describe('Extra', () => {
  const now = new Date()
  const testId = join(process.cwd(), `mwo-test-${+now}`)

  const articleListUrl = join(testId, '/articleList')

  test('Simple customMainPage', async () => {
    await execa('redis-cli flushall', { shell: true })
    await mkdirPromise(testId)

    const articleListLines = `
1%_(South_Park)
İznik
Egyptian_hieroglyphs
Wikipedia:Books/archive/Cancer care
AC/DC`

    await writeFilePromise(articleListUrl, articleListLines, 'utf8')

    const outFiles = await mwoffliner.execute({
      mwUrl: 'https://en.wikipedia.org',
      adminEmail: 'test@kiwix.org',
      articleList: articleListUrl,
      customMainPage: 'Wikipedia:WikiProject_Medicine/Open_Textbook_of_Medicine2',
      outputDirectory: testId,
      redis: process.env.REDIS,
      format: ['nopic'],
      forceRender: 'WikimediaDesktop',
    })

    // Created 1 outputs
    expect(outFiles).toHaveLength(1)

    for (const dump of outFiles) {
      if (dump.nopic) {
        const articleCount = articleListLines.split(/\r\n|\r|\n/).length
        expect(dump.status.articles.success).toEqual(articleCount)
      }

      if (await zimcheckAvailable()) {
        await expect(zimcheck(dump.outFile)).resolves.not.toThrowError()
      } else {
        console.log('Zimcheck not installed, skipping test')
      }
    }

    // Scraped customMainPage
    // TODO: clear test dir
    rimraf.sync(testId)

    const redisScan = await execa('redis-cli --scan', { shell: true })
    // Redis has been cleared
    expect(redisScan.stdout).toEqual('')
  })
})
