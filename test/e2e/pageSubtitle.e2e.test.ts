import { testRenders } from '../testRenders.js'
import domino from 'domino'
import { zimdump } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'

jest.setTimeout(60000)

await testRenders(
  'pageSubtitle',
  {
    mwUrl: 'https://minecraft.wiki',
    pageList: 'Commands/summon,Commands',
    adminEmail: 'test@kiwix.org',
    mwActionApiPath: '/api.php',
  },
  async (outFiles) => {
    const pageFromDump = await zimdump(`show --url "Commands/summon" ${outFiles[0].outFile}`)
    const pageDoc = domino.createDocument(pageFromDump)

    // main namespace has subpages enabled
    test(`test page subtitle for subpage on minecraft.wiki`, async () => {
      const pageSubtitle = pageDoc.querySelector('#contentSub > #mw-content-subtitle')
      expect(pageSubtitle).toBeTruthy()
      expect(pageSubtitle.innerHTML).toBe('<div class="subpages">&lt; <bdi dir="ltr"><a href="../Commands" title="Commands">Commands</a></bdi></div>')
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
  'pageSubtitle',
  {
    mwUrl: 'https://en.wikipedia.org',
    pageList: 'Providence/Stoughton Line',
    adminEmail: 'test@kiwix.org',
  },
  async (outFiles) => {
    const pageFromDump = await zimdump(`show --url "Providence/Stoughton_Line" ${outFiles[0].outFile}`)
    const pageDoc = domino.createDocument(pageFromDump)

    // main namespace has subpages disabled
    test(`test page subtitle for subpage on en.wikipedia.org`, async () => {
      const pageSubtitle = pageDoc.querySelector('#contentSub > #mw-content-subtitle')
      expect(pageSubtitle).toBeTruthy()
      expect(pageSubtitle.innerHTML).toBe('')
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
  ['ActionParse'],
)
