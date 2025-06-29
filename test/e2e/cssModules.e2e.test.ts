import { testRenders } from '../testRenders.js'
import domino from 'domino'
import { zimdump, zimcheck } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'

jest.setTimeout(60000)

const parameters = {
  mwUrl: 'https://de.wikipedia.org',
  articleList: 'Monty_Python’s_Flying_Circus', // use article with a slash in its name to check relative links are properly handled
  adminEmail: 'test@kiwix.org',
}

await testRenders(
  'cssModules',
  parameters,
  async (outFiles) => {
    const articleFromDump = await zimdump(`show --url "${parameters.articleList.replace(' ', '_')}" ${outFiles[0].outFile}`)
    const window = domino.createWindow(articleFromDump)
    const articleDoc = window.document
    // @ts-expect-error Node is not defined but does exists
    const Node = window.Node

    test(`test ZIM integrity for ${outFiles[0]?.renderer} renderer`, async () => {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
    })

    test(`test preceding modules for ${outFiles[0]?.renderer} renderer`, async () => {
      const module = articleDoc.querySelector('link[rel="stylesheet"][href="./mw/ext.cite.styles.css"]')
      const meta = articleDoc.querySelector('meta[name="ResourceLoaderDynamicStyles"]')
      expect(module).toBeTruthy()
      expect(meta).toBeTruthy()
      expect(meta.compareDocumentPosition(module) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    })

    test(`test following modules for ${outFiles[0]?.renderer} renderer`, async () => {
      const module = articleDoc.querySelector('link[rel="stylesheet"][href="./mw/ext.gadget.citeRef.css"]')
      const meta = articleDoc.querySelector('meta[name="ResourceLoaderDynamicStyles"]')
      expect(module).toBeTruthy()
      expect(meta).toBeTruthy()
      expect(meta.compareDocumentPosition(module) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    test(`test site.styles position for ${outFiles[0]?.renderer} renderer`, async () => {
      const gadgetModule = articleDoc.querySelector('link[rel="stylesheet"][href="./mw/ext.gadget.citeRef.css"]')
      const siteStylesModule = articleDoc.querySelector('link[rel="stylesheet"][href="./mw/site.styles.css"]')
      expect(gadgetModule).toBeTruthy()
      expect(siteStylesModule).toBeTruthy()
      expect(siteStylesModule.compareDocumentPosition(gadgetModule) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
  ['ActionParse'],
)
