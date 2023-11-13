import { execa } from 'execa'
import rimraf from 'rimraf'
import { testAllRenders } from '../testRenders.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'

jest.setTimeout(200000)

const describeIf = process.env.S3_URL ? describe : describe.skip

const parameters = {
  mwUrl: 'https://fr.wikipedia.org',
  adminEmail: 'test@kiwix.org',
  redis: process.env.REDIS,
  articleList: 'Paris',
  format: ['nodet'],
  optimisationCacheUrl: process.env.S3_URL,
}

await testAllRenders(parameters, async (outFiles) => {
  describeIf('Check image downloading from S3 using optimisationCacheUrl parameter', () => {
    test(`right scrapping from fr.wikipedia.org with optimisationCacheUrl parameter for ${outFiles[0]?.renderer} renderer`, async () => {
      // TODO: blocked by issues/1931, doesn't work for VE
      // await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError()
      await execa('redis-cli flushall', { shell: true })

      const redisScan = await execa('redis-cli --scan', { shell: true })
      expect(redisScan.stdout).toEqual('')
    })
    afterAll(() => {
      rimraf.sync(`./${outFiles[0].testId}`)
    })
  })
})
