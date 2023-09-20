import * as mwoffliner from '../../src/mwoffliner.lib.js'
import { execa } from 'execa'
import rimraf from 'rimraf'
import { jest } from '@jest/globals'
import { zimcheckAvailable, zimcheck } from '../util.js'

jest.setTimeout(200000)

describe('renderName', () => {
  const now = new Date()
  const testId = `mwo-test-${+now}`

  const parameters = {
    mwUrl: 'https://bm.wikipedia.org',
    adminEmail: 'test@kiwix.org',
    outputDirectory: testId,
    redis: process.env.REDIS,
    format: ['nopic'],
    articleList: 'Fàransi, Kanada',
  }

  beforeAll(async () => {
    await execa('redis-cli flushall', { shell: true })
  })

  test('Scrape article from bm wiki using WikimediaDesktop renderName', async () => {
    const renderName = 'WikimediaDesktop'
    const outFiles = await mwoffliner.execute({ ...parameters, renderName })

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

  test('Scrape article from bm wiki should throw error when using VisualEditor renderName', async () => {
    const renderName = 'VisualEditor'
    expect(async () => {
      await mwoffliner.execute({ ...parameters, renderName })
    }).rejects.toThrowError()
  })

  test('Scrape article from bm wiki should throw error when using wrong renderName', async () => {
    const renderName = 'unknownRenderName'
    expect(async () => {
      await mwoffliner.execute({ ...parameters, renderName })
    }).rejects.toThrowError()
  })
})
