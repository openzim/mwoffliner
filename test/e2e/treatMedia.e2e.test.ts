import * as mwoffliner from '../../src/mwoffliner.lib.js'
import { execa } from 'execa'
import rimraf from 'rimraf'
import { zimdumpAvailable, zimdump } from '../util.js'
import 'dotenv/config'
import { jest } from '@jest/globals'

jest.setTimeout(20000)

describe('treatment test', () => {
  const now = new Date()
  const testId = `mwo-test-${+now}`

  const articleList = 'Read_my_lips:_no_new_taxes'
  const parameters = {
    mwUrl: 'https://en.wikipedia.org',
    adminEmail: 'test@kiwix.org',
    articleList,
    outputDirectory: testId,
    redis: process.env.REDIS,
    forcdRender: 'WikimediaDesktop',
  }

  test('media file from hidden element should not be downloaded', async () => {
    await execa('redis-cli flushall', { shell: true })

    const outFiles = await mwoffliner.execute(parameters)
    // Created 1 output
    expect(outFiles).toHaveLength(1)

    if (await zimdumpAvailable()) {
      await expect(zimdump(`list --url "I/George_Bush_1988_No_New_Taxes.ogg" ${outFiles[0].outFile}`)).rejects.toThrow('Entry not found')
    } else {
      console.log('Zimdump not installed, skipping test')
    }

    rimraf.sync(`./${testId}`)
  })
})
