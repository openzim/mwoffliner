import { rimraf } from 'rimraf'
import { execa } from 'execa'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { zimdump, zimcheck } from '../util.js'
import { testRenders } from '../testRenders.js'

jest.setTimeout(20000)

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  adminEmail: 'test@kiwix.org',
  redis: process.env.REDIS,
  pageList: 'Nairobi,Brian_May',
  format: ['nopic'],
}

// Requesting a custom main page which is among page list is OK
await testRenders(
  'custom-main-page-article',
  { ...parameters, customMainPage: 'Nairobi' },
  async (outFiles) => {
    await execa('redis-cli flushall', { shell: true })

    test(`test ZIM integrity for ${outFiles[0]?.renderer} renderer`, async () => {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
    })

    test(`Custom Main Page to Article for ${outFiles[0]?.renderer} renderer`, async () => {
      // Created 1 output
      expect(outFiles).toHaveLength(1)

      const infos = (await zimdump(`info ${outFiles[0].outFile}`)).split('\n')
      expect(infos).toContain('main page: Nairobi')
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
  ['ActionParse'],
)

// Requesting a custom main page which is a redirect among page list is OK
await testRenders(
  'custom-main-page-redirect',
  { ...parameters, customMainPage: 'Nyrobi' },
  async (outFiles) => {
    await execa('redis-cli flushall', { shell: true })

    test(`test ZIM integrity for ${outFiles[0]?.renderer} renderer`, async () => {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
    })

    test(`Custom Main Page to Article for ${outFiles[0]?.renderer} renderer`, async () => {
      // Created 1 output
      expect(outFiles).toHaveLength(1)

      const infos = (await zimdump(`info ${outFiles[0].outFile}`)).split('\n')
      expect(infos).toContain('main page: Nairobi') // redirect is resolved
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
  ['ActionParse'],
)

// requesting a custom main page which is not in article list is not a problem,
// page is retrieved in addition to articles list
await testRenders(
  'custom-main-page-other',
  { ...parameters, customMainPage: 'Paris' },
  async (outFiles) => {
    await execa('redis-cli flushall', { shell: true })

    test(`test ZIM integrity for ${outFiles[0]?.renderer} renderer`, async () => {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
    })

    test(`Custom Main Page to Article for ${outFiles[0]?.renderer} renderer`, async () => {
      // Created 1 output
      expect(outFiles).toHaveLength(1)

      const infos = (await zimdump(`info ${outFiles[0].outFile}`)).split('\n')
      expect(infos).toContain('main page: Paris') // redirect is resolved
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
  ['ActionParse'],
)

// Requesting a custom main page which does not exists causes a failure
await testRenders(
  'custom-main-page-bad',
  { ...parameters, customMainPage: 'DoesNotExistsAtAll' },
  async (outFiles) => {
    await execa('redis-cli flushall', { shell: true })

    test(`Custom Main Page to Article fails with bad main page`, async () => {
      expect(outFiles).toHaveLength(1)
      expect(outFiles[0].error).toBeDefined()
      expect(outFiles[0].error?.message).toContain("mainPage 'DoesNotExistsAtAll' was not found")
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
  ['ActionParse'],
  true,
)
