import { execa } from 'execa'
import rimraf from 'rimraf'
import { testRenders } from '../testRenders.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'

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

      // Created 1 output
      expect(outFiles).toHaveLength(1)

      // TODO: Blocked by issues/1931
      // await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
    })

    rimraf.sync(`./${outFiles[0].testId}`)
  },
  // en.vikidia.org supports only VisualEditor among other renders
  ['VisualEditor'],
)
