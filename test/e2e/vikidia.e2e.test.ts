import { execa } from 'execa'
import rimraf from 'rimraf'
import { testAllRenders } from '../testAllRenders.js'
import { zimcheck } from '../util.js'
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

await testAllRenders(
  parameters,
  async (outFiles) => {
    // TODO: Enable back once regression Phabricator:T350117 fixed
    test.skip(`right scrapping from vikidia.org for ${outFiles[0]?.renderer} renderer`, async () => {
      await execa('redis-cli flushall', { shell: true })

      // Created 1 output
      expect(outFiles).toHaveLength(1)

      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
    })

    rimraf.sync(`./${outFiles[0].testId}`)
  },
  // vikidia supports only VisualEditor (which is disabled for now) among other renders
  ['VisualEditor'],
)
