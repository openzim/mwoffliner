import { testRenders } from '../testRenders.js'
import domino from 'domino'
import { zimdump } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'

jest.setTimeout(60000)

await testRenders(
  'articleSubtitle',
  {
    mwUrl: 'https://minecraft.wiki',
    articleList: 'Commands/summon,Commands',
    adminEmail: 'test@kiwix.org',
    mwActionApiPath: '/api.php',
    mwModulePath: '/load.php',
    mwWikiPath: '/w/',
  },
  async (outFiles) => {
    const articleFromDump = await zimdump(`show --url "Commands/summon" ${outFiles[0].outFile}`)
    const articleDoc = domino.createDocument(articleFromDump)

    // main namespace has subpages enabled
    test(`test article subtitle for subpage on minecraft.wiki`, async () => {
      const articleSubtitle = articleDoc.querySelector('#contentSub > #mw-content-subtitle')
      expect(articleSubtitle).toBeTruthy()
      expect(articleSubtitle.innerHTML).toBe('<div class="subpages">&lt; <bdi dir="ltr"><a href="../Commands" title="Commands">Commands</a></bdi></div>')
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
  ['ActionParse'],
)

await testRenders(
  'articleSubtitle',
  {
    mwUrl: 'https://en.wikipedia.org',
    articleList: 'Providence/Stoughton Line',
    adminEmail: 'test@kiwix.org',
  },
  async (outFiles) => {
    const articleFromDump = await zimdump(`show --url "Providence/Stoughton_Line" ${outFiles[0].outFile}`)
    const articleDoc = domino.createDocument(articleFromDump)

    // main namespace has subpages disabled
    test(`test article subtitle for subpage on en.wikipedia.org`, async () => {
      const articleSubtitle = articleDoc.querySelector('#contentSub > #mw-content-subtitle')
      expect(articleSubtitle).toBeTruthy()
      expect(articleSubtitle.innerHTML).toBe('')
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
  ['ActionParse'],
)
