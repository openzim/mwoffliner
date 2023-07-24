import * as mwoffliner from '../../src/mwoffliner.lib.js'
import { execa } from 'execa'
import rimraf from 'rimraf'
import { zimcheckAvailable, zimcheck, zimdumpAvailable, zimdump } from '../util.js'
import 'dotenv/config'
import { jest } from '@jest/globals'

jest.setTimeout(60000)

describe('Multimedia', () => {
  const now = new Date()
  const testId = `mwo-test-${+now}`

  const parameters = {
    mwUrl: 'https://en.m.wikipedia.org',
    adminEmail: 'test@kiwix.org',
    articleList: 'User:Kelson/MWoffliner_CI_reference',
    outputDirectory: testId,
    redis: process.env.REDIS,
    customZimDescription: 'Example of the description',
  }

  /** TODO: test this with Github actions and locally */
  test('check multimedia content from wikipedia test page', async () => {
    await execa('redis-cli flushall', { shell: true })

    const [dump] = await mwoffliner.execute(parameters)

    expect(dump.status.articles.success).toEqual(1)
    expect(dump.status.articles.fail).toEqual(0)

    if (await zimcheckAvailable()) {
      await expect(zimcheck(dump.outFile)).resolves.not.toThrowError()
    } else {
      console.log('Zimcheck not installed, skipping test')
    }

    if (await zimdumpAvailable()) {
      const mediaFiles = await zimdump(`list --ns I ${dump.outFile}`)

      expect(mediaFiles.split('\n').sort()).toEqual(
        [
          'I/Kiwix_-_WikiArabia_Cairo_2017.pdf',
          'I/Kiwix_Hackathon_2017_Florence_WikiFundi.webm.120p.vp9.webm',
          'I/Kiwix_Hackathon_2017_Florence_WikiFundi.webm.jpg',
          'I/Kiwix_icon.svg.png',
          'I/Local_Forecast_-_Elevator_(ISRC_USUAN1300012).mp3.ogg',
          'I/page1-120px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
          'I/page1-1500px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
        ].sort(),
      )
    } else {
      console.log('Zimcheck not installed, skipping test')
    }

    rimraf.sync(`./${testId}`)
    const redisScan = await execa('redis-cli --scan', { shell: true })
    // Redis has been cleared
    expect(redisScan.stdout).toEqual('')
  })

  test('check multimedia content from wikipedia test page with different formates', async () => {
    await execa('redis-cli flushall', { shell: true })
    const dumps = await mwoffliner.execute({ ...parameters, format: ['nopic', 'novid', 'nopdf', 'nodet'] })

    expect(dumps).toHaveLength(4)
    for (const dump of dumps) {
      expect(dump.status.articles.success).toEqual(1)
      expect(dump.status.articles.fail).toEqual(0)

      if (await zimcheckAvailable()) {
        await expect(zimcheck(dump.outFile)).resolves.not.toThrowError()
      } else {
        console.log('Zimcheck not installed, skipping test')
      }

      if (await zimdumpAvailable()) {
        const mediaFiles = await zimdump(`list --ns I ${dump.outFile}`)
        if (dump.nopic) {
          expect(mediaFiles.split('\n').sort()).toEqual(
            [
              'I/Kiwix_-_WikiArabia_Cairo_2017.pdf',
              // 'I/Kiwix_Hackathon_2017_Florence_WikiFundi.webm.120p.vp9.webm', // these files were omitted by nopic parameter
              // 'I/Kiwix_Hackathon_2017_Florence_WikiFundi.webm.jpg',
              // 'I/Kiwix_icon.svg.png',
              // 'I/Local_Forecast_-_Elevator_(ISRC_USUAN1300012).mp3.ogg',
              // 'I/page1-120px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
              // 'I/page1-1500px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
            ].sort(),
          )
        } else if (dump.novid) {
          expect(mediaFiles.split('\n').sort()).toEqual(
            [
              'I/Kiwix_-_WikiArabia_Cairo_2017.pdf',
              // 'I/Kiwix_Hackathon_2017_Florence_WikiFundi.webm.120p.vp9.webm', // these files were omitted by novid parameter
              // 'I/Kiwix_Hackathon_2017_Florence_WikiFundi.webm.jpg',
              'I/Kiwix_icon.svg.png',
              // 'I/Local_Forecast_-_Elevator_(ISRC_USUAN1300012).mp3.ogg',
              'I/page1-120px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
              'I/page1-1500px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
            ].sort(),
          )
        } else if (dump.nopdf) {
          expect(mediaFiles.split('\n').sort()).toEqual(
            [
              // 'I/Kiwix_-_WikiArabia_Cairo_2017.pdf',  // this file was omitted by nopdf parameter
              'I/Kiwix_Hackathon_2017_Florence_WikiFundi.webm.120p.vp9.webm',
              'I/Kiwix_Hackathon_2017_Florence_WikiFundi.webm.jpg',
              'I/Kiwix_icon.svg.png',
              'I/Local_Forecast_-_Elevator_(ISRC_USUAN1300012).mp3.ogg',
              'I/page1-120px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
              'I/page1-1500px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
            ].sort(),
          )
        }
      } else {
        console.log('Zimcheck not installed, skipping test')
      }
    }
    rimraf.sync(`./${testId}`)
    const redisScan = await execa('redis-cli --scan', { shell: true })
    // Redis has been cleared
    expect(redisScan.stdout).toEqual('')
  })
})
