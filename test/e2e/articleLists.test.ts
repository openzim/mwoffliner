import * as mwoffliner from '../../src/mwoffliner.lib.js'
import { execa } from 'execa'
import rimraf from 'rimraf'
import { zimcheckAvailable, zimcheck } from '../util.js'
import 'dotenv/config'
import { jest } from '@jest/globals'

jest.setTimeout(10000)

describe('articleList', () => {
  const now = new Date()
  const testId = `mwo-test-${+now}`

  const articleList = 'Kiwix,Wikipedia,Internet,Real-time computer graphics'
  const articleListToIgnore = 'Wikipedia, Internet'
  const listMinusIgnore = 2
  const parameters = {
    mwUrl: 'https://en.wikipedia.org',
    adminEmail: 'test@kiwix.org',
    articleList,
    articleListToIgnore,
    outputDirectory: testId,
    redis: process.env.REDIS,
    format: ['nopic'],
    forceRender: 'WikimediaDesktop',
  }

  test('articleList and articleListIgnore check', async () => {
    await execa('redis-cli flushall', { shell: true })

    const outFiles = await mwoffliner.execute(parameters)

    // Created 1 output
    expect(outFiles).toHaveLength(1)

    for (const dump of outFiles) {
      if (dump.nopic) {
        // Output has right amount of articles
        expect(dump.status.articles.success).toEqual(listMinusIgnore)
        // Output has no failed article
        expect(dump.status.articles.fail).toEqual(0)
      }
    }

    // Scraped selected articles from wikipedia en');
    if (await zimcheckAvailable()) {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
    } else {
      console.log('Zimcheck not installed, skipping test')
    }

    rimraf.sync(`./${testId}`)
    const redisScan = await execa('redis-cli --scan', { shell: true })
    // Redis has been cleared
    expect(redisScan.stdout).toEqual('')
  })
})
