import { testAllRenders } from '../testRenders.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'
import { sanitizeApiPathParam } from '../../src/sanitize-argument.js'
import { zimcheck } from '../util.js'

jest.setTimeout(60000)

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  articleList: 'BMW',
  adminEmail: 'test@kiwix.org',
  mwActionApiPath: sanitizeApiPathParam('/w/api.php'),
  mwModulePath: sanitizeApiPathParam('/w/load.php'),
}

await testAllRenders('api-path-params', parameters, async (outFiles) => {
  describe(`e2e test for api url params for en.wikipedia.org for ${outFiles[0]?.renderer} renderer`, () => {
    test('Mediawiki actionApiPath option sanitized', () => {
      expect(outFiles[0].mwMetaData.actionApiPath).toBe('/w/api.php')
    })

    test('Mediawiki modulePathOpt option sanitized', () => {
      expect(outFiles[0].mwMetaData.modulePathOpt).toBe('/w/load.php')
    })

    test('Mediawiki modulePath and actionApiUrl options', () => {
      expect(outFiles[0].mwMetaData.modulePath).toBe('https://en.wikipedia.org/w/load.php?')
      expect(outFiles[0].mwMetaData.actionApiUrl).toBe('https://en.wikipedia.org/w/api.php')
    })

    test(`test ZIM integrity for ${outFiles[0]?.renderer} renderer`, async () => {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  })
})
