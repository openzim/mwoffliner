import * as mwoffliner from '../../src/mwoffliner.lib.js'
import { execa } from 'execa'
import rimraf from 'rimraf'
import { zimdumpAvailable, zimdump } from '../util.js'
import 'dotenv/config'
import { jest } from '@jest/globals'

jest.setTimeout(20000)

describe('zimMetadata', () => {
  const now = new Date()
  const testId = `mwo-test-${+now}`

  const articleList = 'Kiwix'
  const parameters = {
    mwUrl: 'https://en.wikipedia.org',
    adminEmail: 'test@kiwix.org',
    articleList,
    outputDirectory: testId,
    redis: process.env.REDIS,
    format: ['nopic'],
    customZimDescription: 'Example of the description',
    customZimLongDescription: 'Example of the long description',
    customZimTitle: 'Example of the title',
    publisher: 'Example of the publisher',
  }

  test('check all zim metadata using zimdump', async () => {
    await execa('redis-cli flushall', { shell: true })

    const outFiles = await mwoffliner.execute(parameters)
    // Created 1 output
    expect(outFiles).toHaveLength(1)

    if (await zimdumpAvailable()) {
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
        ].map(async ({ option, output }) => {
          expect(await zimdump(`show --url "M/${option}" ${outFiles[0].outFile}`)).toBe(output)
        }),
      )
    } else {
      console.log('Zimdump not installed, skipping test')
    }

    rimraf.sync(`./${testId}`)
  })
})
