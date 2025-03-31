import { execa } from 'execa'
import rimraf from 'rimraf'
import { testAllRenders } from '../testRenders.js'
import { zimdump } from '../util.js'
import 'dotenv/config'
import { jest } from '@jest/globals'

jest.setTimeout(20000)

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  adminEmail: 'test@kiwix.org',
  articleList: 'Read_my_lips:_no_new_taxes',
  redis: process.env.REDIS,
}

await testAllRenders('treat-media', parameters, async (outFiles) => {
  test('media file from hidden element should not be downloaded', async () => {
    await execa('redis-cli flushall', { shell: true })

    // Created 1 output
    expect(outFiles).toHaveLength(1)
    await expect(zimdump(`list --url "George_Bush_1988_No_New_Taxes.ogg" ${outFiles[0].outFile}`)).rejects.toThrow('Entry not found')
  })

  afterAll(() => {
    if (!process.env.KEEP_ZIMS) {
      rimraf.sync(`./${outFiles[0].testId}`)
    }
  })
})
