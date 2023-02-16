import * as mwoffliner from '../../src/mwoffliner.lib.js'
import { execa } from 'execa'
import rimraf from 'rimraf'
import { zimcheckAvailable, zimcheck } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'

jest.setTimeout(200000)

describe('vikidia', () => {
  const now = new Date()
  const testId = `mwo-test-${+now}`

  const parameters = {
    mwUrl: 'https://en.vikidia.org',
    adminEmail: 'test@kiwix.org',
    outputDirectory: testId,
    redis: process.env.REDIS,
    articleList: 'Alaska',
  }

  test('right scrapping from vikidia.org', async () => {
    await execa('redis-cli flushall', { shell: true })

    const outFiles = await mwoffliner.execute(parameters)

    // Created 1 output
    expect(outFiles).toHaveLength(1)

    if (await zimcheckAvailable()) {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
    } else {
      console.log('Zimcheck not installed, skipping test')
    }

    // TODO: clear test dir
    rimraf.sync(`./${testId}`)

    const redisScan = await execa('redis-cli --scan', { shell: true })
    // Redis has been cleared
    expect(redisScan.stdout).toEqual('')
  })
})
