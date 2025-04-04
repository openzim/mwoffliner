import { rimraf } from 'rimraf'
import { execa } from 'execa'
import { testAllRenders } from '../testRenders.js'
import { zimdump } from '../util.js'
import 'dotenv/config'
import { jest } from '@jest/globals'

jest.setTimeout(20000)

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  adminEmail: 'test@kiwix.org',
  articleList: 'Kiwix',
  redis: process.env.REDIS,
  format: ['nopic'],
  customZimDescription: 'Example of the description',
  customZimLongDescription: 'Example of the long description',
  customZimTitle: 'Example of the title',
  publisher: 'Example of the publisher',
}

await testAllRenders('zim-metadata', parameters, async (outFiles) => {
  xdescribe('zimMetadata', () => {
    test(`check all zim metadata using zimdump for ${outFiles[0]?.renderer} renderer`, async () => {
      await execa('redis-cli flushall', { shell: true })

      expect(outFiles).toHaveLength(1)

      await Promise.all(
        [
          { option: 'Tags', output: 'wikipedia;_category:wikipedia;_pictures:no;_videos:no;_details:yes;_ftindex:yes' },
          { option: 'Language', output: 'eng' },
          { option: 'Title', output: parameters.customZimTitle },
          { option: 'Name', output: 'wikipedia_en_kiwix' },
          { option: 'Flavour', output: 'nopic' },
          { option: 'Description', output: parameters.customZimDescription },
          { option: 'LongDescription', output: parameters.customZimLongDescription },
          { option: 'Creator', output: 'Wikipedia' },
          { option: 'Publisher', output: parameters.publisher },
          { option: 'Source', output: 'en.wikipedia.org' },
        ].map(async ({ option, output }) => {
          expect(await zimdump(`show --url "${option}" ${outFiles[0].outFile}`)).toBe(output)
        }),
      )

      expect(await zimdump(`show --url "Illustration_48x48@1" ${outFiles[0].outFile}`)).toBeDefined()
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  })
})
