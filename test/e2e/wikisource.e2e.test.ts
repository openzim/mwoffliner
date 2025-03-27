import { execa } from 'execa'
import rimraf from 'rimraf'
import { testRenders } from '../testRenders.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'

jest.setTimeout(20000)

const parameters = {
  mwUrl: 'https://fo.wikisource.org',
  adminEmail: 'test@kiwix.org',
  redis: process.env.REDIS,
  format: ['nopic'],
  noLocalParserFallback: true,
}

await testRenders(
  parameters,
  async (outFiles) => {
    describe('wikisource', () => {
      switch (outFiles[0].renderer) {
        case 'WikimediaDesktop':
          test(`Wikisource List for ${outFiles[0]?.renderer} renderer`, async () => {
            await execa('redis-cli flushall', { shell: true })

            expect(outFiles).toHaveLength(1)

            for (const dump of outFiles) {
              if (dump.nopic) {
                console.log(dump.status.files.fail)
                // nopic has enough files
                expect(dump.status.files.success).toBeGreaterThanOrEqual(7)
                // nopic has enough redirects
                expect(dump.status.redirects.written).toBeGreaterThanOrEqual(16)
                // nopic has enough articles
                expect(dump.status.articles.success).toBeGreaterThanOrEqual(61)
              }
            }
          })

          afterAll(() => {
            rimraf.sync(`./${outFiles[0].testId}`)
          })
          break
        case 'VisualEditor':
          test(`Wikisource List for ${outFiles[0]?.renderer} renderer`, async () => {
            await execa('redis-cli flushall', { shell: true })

            expect(outFiles).toHaveLength(1)

            for (const dump of outFiles) {
              if (dump.nopic) {
                // nopic has enough files
                expect(dump.status.files.success).toBeGreaterThanOrEqual(7)
                // nopic has enough redirects
                expect(dump.status.redirects.written).toBeGreaterThanOrEqual(16)
                // nopic has enough articles
                expect(dump.status.articles.success).toBeGreaterThanOrEqual(61)
              }
            }
          })
          rimraf.sync(`./${outFiles[0].testId}`)
          break
      }
    })
  },
  ['WikimediaDesktop', 'VisualEditor', 'RestApi'],
)
