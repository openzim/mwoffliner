import { zimdump, zimcheck } from '../util.js'
import { testAllRenders } from '../testRenders.js'
import { execa } from 'execa'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'
import 'dotenv/config.js'

jest.setTimeout(200000)

const parameters = {
  mwUrl: 'https://bm.wikipedia.org',
  adminEmail: 'test@kiwix.org',
  redis: process.env.REDIS,
  format: ['nopic'],
}

await testAllRenders('bm-wikipedia', parameters, async (outFiles) => {
  test(`test ZIM integrity for ${outFiles[0]?.renderer} renderer`, async () => {
    await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
  })

  test(`Simple articleList for ${outFiles[0]?.renderer} renderer for bm.wikipedia.org`, async () => {
    await execa('redis-cli flushall', { shell: true })
    // Created 1 output
    expect(outFiles).toHaveLength(1)

    for (const dump of outFiles) {
      if (dump.nopic) {
        // nopic has enough files (this is just an estimate and can change
        // with time, as new Mediwiki versions are released).
        expect(dump.status.files.success).toBeGreaterThanOrEqual(outFiles[0].renderer == 'WikimediaMobile' ? 1 : 3)
        expect(dump.status.files.success).toBeLessThan(20)
        // nopic has enough redirects
        expect(dump.status.redirects.written).toBeGreaterThan(170)
        // nopic has enough articles
        expect(dump.status.articles.success).toBeGreaterThan(700)
      }
    }
  })

  afterAll(() => {
    if (!process.env.KEEP_ZIMS) {
      rimraf.sync(`./${outFiles[0].testId}`)
    }
  })
})

await testAllRenders('bm-wikipedia-with-ns-1', { ...parameters, addNamespaces: 1 }, async (outFiles) => {
  test(`Articles with "Discussion" namespace for ${outFiles[0]?.renderer} renderer for bm.wikipedia.org`, async () => {
    await execa('redis-cli flushall', { shell: true })

    // Created 1 output
    expect(outFiles).toHaveLength(1)
    const discussionArticlesStr = await zimdump(`list ${outFiles[0].outFile}`)
    const discussionArticlesList = discussionArticlesStr.match(/Discussion:/g)
    expect(discussionArticlesList.length).toBeGreaterThan(30)
  })
  afterAll(() => {
    if (!process.env.KEEP_ZIMS) {
      rimraf.sync(`./${outFiles[0].testId}`)
    }
  })
})
