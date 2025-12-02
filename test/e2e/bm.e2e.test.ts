// import { zimdump, zimcheck } from '../util.js'
// import { testAllRenders } from '../testRenders.js'
import { zimdump } from '../util.js'
import { testRenders } from '../testRenders.js'
import { execa } from 'execa'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'
import 'dotenv/config.js'
import { RENDERERS_LIST } from '../../src/util/const.js'

jest.setTimeout(200000)

const parameters = {
  mwUrl: 'https://bm.wikipedia.org',
  adminEmail: 'test@kiwix.org',
  redis: process.env.REDIS,
  format: ['nopic'],
}

// await testAllRenders('bm-wikipedia', parameters, async (outFiles) => {
//   test(`test ZIM integrity for ${outFiles[0]?.renderer} renderer`, async () => {
//     await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
//   })

//   test(`Simple articleList for ${outFiles[0]?.renderer} renderer for bm.wikipedia.org`, async () => {
//     await execa('redis-cli flushall', { shell: true })
//     // Created 1 output
//     expect(outFiles).toHaveLength(1)

//     for (const dump of outFiles) {
//       if (dump.nopic) {
//         // nopic has enough files (this is just an estimate and can change
//         // with time, as new Mediwiki versions are released).
//         expect(dump.status.files.success).toBeGreaterThanOrEqual(outFiles[0].renderer == 'WikimediaMobile' ? 1 : 3)
//         expect(dump.status.files.success).toBeLessThan(20)
//         // nopic has enough redirects
//         expect(dump.status.redirects.written).toBeGreaterThan(170)
//         // nopic has enough articles
//         expect(dump.status.articles.success).toBeGreaterThan(700)
//       }
//     }
//   })

//   test(`test redirect without fragment ${outFiles[0]?.renderer} renderer`, async () => {
//     // "Bamako" should be a redirect to "Bamakɔ"
//     const redirectInfo = await zimdump(`list --details --url Bamako ${outFiles[0].outFile}`)

//     expect(redirectInfo).toMatch(/path:\s*Bamako/)
//     expect(redirectInfo).toMatch(/title:\s*Bamako/)
//     expect(redirectInfo).toMatch(/type:\s*redirect/)
//     const redirectIndexMatch = redirectInfo.match(/redirect index:\s*(\d+)/)
//     expect(redirectIndexMatch).not.toBe(null)
//     const redirectIndex = redirectIndexMatch ? parseInt(redirectIndexMatch[1], 10) : null
//     expect(redirectIndex).not.toBeNull()

//     const redirectTargetInfo = await zimdump(`list --details --idx ${redirectIndex} ${outFiles[0].outFile}`)
//     expect(redirectTargetInfo).toMatch(/path:\s*Bamakɔ/)
//     expect(redirectTargetInfo).toMatch(/title:\s*Bamakɔ/)
//     expect(redirectTargetInfo).toMatch(/type:\s*item/)
//   })

//   test(`test redirect with fragment ${outFiles[0]?.renderer} renderer`, async () => {
//     // "Bamakɔ_Monumentsa" should be an HTML item which will redirect to "Bamakɔ#Monumentsa_ni_yɔrɔ"
//     // through http-equiv="refresh"
//     const redirectInfo = await zimdump(`list --details --url Bamakɔ_Monumentsa ${outFiles[0].outFile}`)

//     expect(redirectInfo).toMatch(/path:\s*Bamakɔ_Monumentsa/)
//     expect(redirectInfo).toMatch(/title:\s*Bamakɔ Monumentsa/)
//     expect(redirectInfo).toMatch(/type:\s*item/)

//     const redirectFromDump = await zimdump(`show --url Bamakɔ_Monumentsa ${outFiles[0].outFile}`)
//     expect(redirectFromDump).toContain('<title>Bamakɔ Monumentsa</title>')
//     expect(redirectFromDump).toContain('<meta http-equiv="refresh" content="0;URL=\'./Bamakɔ#Monumentsa_ni_yɔrɔ\'" />')
//     expect(redirectFromDump).toContain('<a href="./Bamakɔ#Monumentsa_ni_yɔrɔ">Bamakɔ Monumentsa</a>')
//   })

//   afterAll(() => {
//     if (!process.env.KEEP_ZIMS) {
//       rimraf.sync(`./${outFiles[0].testId}`)
//     }
//   })
// })

await testRenders(
  'bm-wikipedia-with-ns-1',
  { ...parameters, addNamespaces: 1 },
  async (outFiles) => {
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
  },
  RENDERERS_LIST.filter((renderer) => renderer === 'WikimediaDesktop'),
)
