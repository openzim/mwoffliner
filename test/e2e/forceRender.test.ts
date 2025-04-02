import * as mwoffliner from '../../src/mwoffliner.lib.js'
import { execa } from 'execa'
import { rimraf } from 'rimraf'
import { jest } from '@jest/globals'
import { zimcheckAvailable, zimcheck } from '../util.js'

jest.setTimeout(200000)

describe('forceRender', () => {
  const now = new Date()
  const testId = `mwo-test-${+now}`

  const parameters = {
    mwUrl: 'https://bm.wikipedia.org',
    adminEmail: 'test@kiwix.org',
    outputDirectory: testId,
    redis: process.env.REDIS,
    format: ['nopic'],
    articleList: 'France',
    mwActionApiPath: '/w/api.php',
  }

  afterAll(async () => {
    await execa('redis-cli flushall', { shell: true })
    rimraf.sync(`./${testId}`)
    const redisScan = await execa('redis-cli --scan', { shell: true })
    // Redis has been cleared
    expect(redisScan.stdout).toEqual('')
  })

  test('Scrape article from bm.wikipedia.org using WikimediaDesktop render', async () => {
    const forceRender = 'WikimediaDesktop'
    const outFiles = await mwoffliner.execute({ ...parameters, forceRender })

    if (await zimcheckAvailable()) {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
    } else {
      console.log('Zimcheck not installed, skipping test')
    }
  })
})
