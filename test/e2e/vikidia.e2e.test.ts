test('skipped vikidia test', () => {
  return
})

/*
// https://github.com/openzim/mwoffliner/issues/2039
import { execa } from 'execa'
import rimraf from 'rimraf'
import { testRenders } from '../testRenders.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { zimcheck } from '../util.js'

jest.setTimeout(200000)

const parameters = {
  mwUrl: 'https://en.vikidia.org',
  adminEmail: 'test@kiwix.org',
  redis: process.env.REDIS,
  articleList: 'Alaska',
  customZimDescription: 'Alaska article',
}

await testRenders(
  parameters,
  async (outFiles) => {
    test(`right scrapping from vikidia.org for ${outFiles[0]?.renderer} renderer`, async () => {
      await execa('redis-cli flushall', { shell: true })
      expect(outFiles).toHaveLength(1)
    })

    test(`test zim integrity for ${outFiles[0]?.renderer} renderer`, async () => {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
    })

    afterAll(() => {
      rimraf.sync(`./${outFiles[0].testId}`)
    })
  },
  // en.vikidia.org supports only VisualEditor among other renders
  ['VisualEditor'],
)
*/
