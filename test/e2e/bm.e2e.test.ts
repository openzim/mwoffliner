import * as mwoffliner from '../../src/mwoffliner.lib.js'
import { zimdump, zimcheck } from '../util.js'
import { testAllRenders } from '../testAllRenders.js'
import { execa } from 'execa'
import { jest } from '@jest/globals'
import rimraf from 'rimraf'
import 'dotenv/config.js'

jest.setTimeout(200000)

const parameters = {
  mwUrl: 'https://bm.wikipedia.org',
  adminEmail: 'test@kiwix.org',
  redis: process.env.REDIS,
  format: ['nopic'],
}

await testAllRenders(parameters, async (outFiles) => {
  describe('e2e test for bm.wikipedia.org', () => {
    test(`test zim integrity for ${outFiles[0]?.renderer} renderer`, async () => {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
    })

    test(`Simple articleList for ${outFiles[0]?.renderer} renderer`, async () => {
      // Created 1 output
      expect(outFiles).toHaveLength(1)

      for (const dump of outFiles) {
        if (dump.nopic) {
          // nopic has enough files
          expect(dump.status.files.success).toBeGreaterThan(14)
          // nopic has enough redirects
          expect(dump.status.redirects.written).toBeGreaterThan(170)
          // nopic has enough articles
          expect(dump.status.articles.success).toBeGreaterThan(700)
        }
      }
    })

    test(`Articles with "Discussion" namespace for ${outFiles[0]?.renderer} renderer`, async () => {
      await execa('redis-cli flushall', { shell: true })
      const outFiles = await mwoffliner.execute({ ...parameters, addNamespaces: 1 })

      // Created 1 output
      expect(outFiles).toHaveLength(1)
      const discussionArticlesStr = await zimdump(`list --ns A/Discussion ${outFiles[0].outFile}`)
      const discussionArticlesList = discussionArticlesStr.match(/Discussion:/g)
      expect(discussionArticlesList.length).toBeGreaterThan(30)
    })

    afterAll(() => {
      rimraf.sync(`./${outFiles[0].testId}`)
    })
  })
})
