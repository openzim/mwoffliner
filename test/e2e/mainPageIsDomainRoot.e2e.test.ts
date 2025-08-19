import { testRenders } from '../testRenders.js'
import domino from 'domino'
import { zimdump } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'

jest.setTimeout(60000)

await testRenders(
  'mainPageIsDomainRoot',
  {
    mwUrl: 'https://minecraft.wiki',
    articleList: 'Minecraft_Wiki/editcopy,Minecraft_Wiki',
    adminEmail: 'test@kiwix.org',
    mwActionApiPath: '/api.php',
    mwModulePath: '/load.php',
    mwWikiPath: '/w/',
  },
  async (outFiles) => {
    const mainPageFromDump = await zimdump(`show --url "Minecraft_Wiki" ${outFiles[0].outFile}`)
    const mainPageDoc = domino.createDocument(mainPageFromDump)
    const articleFromDump = await zimdump(`show --url "Minecraft_Wiki/editcopy" ${outFiles[0].outFile}`)
    const articleDoc = domino.createDocument(articleFromDump)

    // wiki has main page at domain root
    test(`test main page link on minecraft.wiki`, async () => {
      const { mainPageIsDomainRoot } = outFiles[0].mwMetaData
      const mainPage = mainPageDoc.querySelector('body.page-Main_Page')
      const articleSubtitle = articleDoc.querySelector('#contentSub > #mw-content-subtitle')
      // Make sure we are testing the actual main page
      expect(mainPage).toBeTruthy()
      // Make sure mainPageIsDomainRoot is enabled
      expect(mainPageIsDomainRoot).toBe(true)
      expect(articleSubtitle).toBeTruthy()
      // Test if we have correctly rewritting the href from just "/"
      expect(articleSubtitle.innerHTML).toBe('<div class="subpages">&lt; <bdi dir="ltr"><a href="../Minecraft_Wiki" title="Minecraft Wiki">Minecraft Wiki</a></bdi></div>')
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
  ['ActionParse'],
)
