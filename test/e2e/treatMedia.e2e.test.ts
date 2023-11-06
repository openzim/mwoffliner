import { execa } from 'execa'
import rimraf from 'rimraf'
import { testAllRenders } from '../testAllRenders.js'
import { zimdump } from '../util.js'
import 'dotenv/config'
import { jest } from '@jest/globals'

jest.setTimeout(20000)

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  adminEmail: 'test@kiwix.org',
  articleList: 'Read_my_lips:_no_new_taxes',
  redis: process.env.REDIS,
  mwActionApiPath: 'w/api.php',
  mwWikiPath: '/',
}

await testAllRenders(parameters, async (outFiles) => {
  test('media file from hidden element should not be downloaded', async () => {
    await execa('redis-cli flushall', { shell: true })

    // Created 1 output
    expect(outFiles).toHaveLength(1)
    await expect(zimdump(`list --url "I/George_Bush_1988_No_New_Taxes.ogg" ${outFiles[0].outFile}`)).rejects.toThrow('Entry not found')
  })

  afterAll(() => {
    rimraf.sync(`./${outFiles[0].testId}`)
  })
})
