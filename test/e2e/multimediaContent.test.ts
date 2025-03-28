import { execa } from 'execa'
import { testRenders } from '../testRenders.js'
import rimraf from 'rimraf'
import { zimdump, zimcheck } from '../util.js'
import 'dotenv/config'
import { jest } from '@jest/globals'

jest.setTimeout(60000)

const parameters = {
  mwUrl: 'https://en.m.wikipedia.org',
  adminEmail: 'test@kiwix.org',
  articleList: 'User:Kelson/MWoffliner_CI_reference',
  redis: process.env.REDIS,
  customZimDescription: 'Example of the description',
}

await testRenders(
  'multimedia-content',
  parameters,
  async (outFiles) => {
    describe('Multimedia', () => {
      switch (outFiles[0].renderer) {
        case 'WikimediaDesktop':
          test('check multimedia content from wikipedia test page for WikimediaDesktop renderer', async () => {
            await execa('redis-cli flushall', { shell: true })

            expect(outFiles[0].status.articles.success).toEqual(1)
            expect(outFiles[0].status.articles.fail).toEqual(0)
            const mediaFiles = await zimdump(`list --ns I ${outFiles[0].outFile}`)

            expect(mediaFiles.split('\n').sort()).toEqual(
              [
                'I/Kiwix_-_WikiArabia_Cairo_2017.pdf',
                // TODO: This file is no longer write into image namespace, see issues/1943. Probably, it shouldn't be there earlier
                'I/Kiwix_Hackathon_2017_Florence_WikiFundi.webm.240p.vp9.webm',
                'I/Kiwix_Hackathon_2017_Florence_WikiFundi.webm.jpg',
                'I/Kiwix_icon.svg.png',
                'I/Local_Forecast_-_Elevator_(ISRC_USUAN1300012).mp3.ogg',
                'I/page1-120px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                'I/page1-1500px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
              ].sort(),
            )
          })
          afterAll(() => {
            if (!process.env.KEEP_ZIMS) {
              rimraf.sync(`./${outFiles[0].testId}`)
            }
          })
          break
        case 'VisualEditor':
          test('check multimedia content from wikipedia test page for VisualEditor renderer', async () => {
            await execa('redis-cli flushall', { shell: true })

            expect(outFiles[0].status.articles.success).toEqual(1)
            expect(outFiles[0].status.articles.fail).toEqual(0)
            const mediaFiles = await zimdump(`list --ns I ${outFiles[0].outFile}`)

            expect(mediaFiles.split('\n').sort()).toEqual(
              [
                'I/Kiwix_-_WikiArabia_Cairo_2017.pdf',
                // TODO: This file is no longer write into image namespace, see issues/1943. Probably, it shouldn't be there earlier
                'I/Kiwix_Hackathon_2017_Florence_WikiFundi.webm.240p.vp9.webm',
                'I/Kiwix_Hackathon_2017_Florence_WikiFundi.webm.jpg',
                'I/Kiwix_icon.svg.png',
                'I/Local_Forecast_-_Elevator_(ISRC_USUAN1300012).mp3.ogg',
                'I/page1-120px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                'I/page1-1500px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
              ].sort(),
            )
          })
          afterAll(() => {
            if (!process.env.KEEP_ZIMS) {
              rimraf.sync(`./${outFiles[0].testId}`)
            }
          })
          break
      }
    })
  },
  ['WikimediaDesktop', 'VisualEditor'],
)

await testRenders(
  'multimedia-content',
  { ...parameters, format: ['nopic', 'novid', 'nopdf', 'nodet'] },
  async (outFiles) => {
    describe('Multimedia for different formats', () => {
      // TODO: blocked by issues/1925
      switch (outFiles[0].renderer) {
        case 'WikimediaDesktop':
          test('check multimedia content from wikipedia test page with different formats for WikimediaDesktop renderer', async () => {
            await execa('redis-cli flushall', { shell: true })

            expect(outFiles).toHaveLength(4)

            for (const dump of outFiles) {
              expect(dump.status.articles.success).toEqual(1)
              expect(dump.status.articles.fail).toEqual(0)

              await expect(zimcheck(dump.outFile)).resolves.not.toThrowError()

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
                    'I/Kiwix_Hackathon_2017_Florence_WikiFundi.webm.240p.vp9.webm',
                    'I/Kiwix_Hackathon_2017_Florence_WikiFundi.webm.jpg',
                    'I/Kiwix_icon.svg.png',
                    'I/Local_Forecast_-_Elevator_(ISRC_USUAN1300012).mp3.ogg',
                    'I/page1-120px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                    'I/page1-1500px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                  ].sort(),
                )
              }
            }
          })
          afterAll(() => {
            if (!process.env.KEEP_ZIMS) {
              rimraf.sync(`./${outFiles[0].testId}`)
            }
          })
          break
        case 'VisualEditor':
          test('check multimedia content from wikipedia test page with different formats for VisualEditor renderer', async () => {
            await execa('redis-cli flushall', { shell: true })

            expect(outFiles).toHaveLength(4)

            for (const dump of outFiles) {
              expect(dump.status.articles.success).toEqual(1)
              expect(dump.status.articles.fail).toEqual(0)

              await expect(zimcheck(dump.outFile)).resolves.not.toThrowError()

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
                    'I/Kiwix_Hackathon_2017_Florence_WikiFundi.webm.240p.vp9.webm',
                    'I/Kiwix_Hackathon_2017_Florence_WikiFundi.webm.jpg',
                    'I/Kiwix_icon.svg.png',
                    'I/Local_Forecast_-_Elevator_(ISRC_USUAN1300012).mp3.ogg',
                    'I/page1-120px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                    'I/page1-1500px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                  ].sort(),
                )
              }
            }
          })
          afterAll(() => {
            if (!process.env.KEEP_ZIMS) {
              rimraf.sync(`./${outFiles[0].testId}`)
            }
          })
          break
      }
    })
  },
  ['WikimediaDesktop', 'VisualEditor'],
)
