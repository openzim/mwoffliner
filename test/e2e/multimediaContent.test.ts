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
            const allFiles = await zimdump(`list ${outFiles[0].outFile}`)
            const allFilesArr = allFiles.split('\n')
            const mediaFiles = allFilesArr
              .filter((elem) => elem.endsWith('pdf') || elem.endsWith('png') || elem.endsWith('jpg') || elem.endsWith('webm') || elem.endsWith('ogg'))
              .sort()

            expect(mediaFiles).toEqual(
              [
                'Kiwix_-_WikiArabia_Cairo_2017.pdf',
                'Kiwix_Hackathon_2017_Florence_WikiFundi.webm.240p.vp9.webm',
                'Kiwix_Hackathon_2017_Florence_WikiFundi.webm.jpg',
                'Kiwix_icon.svg.png',
                'Local_Forecast_-_Elevator_(ISRC_USUAN1300012).mp3.ogg',
                'page1-120px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                'page1-1500px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
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
            const allFiles = await zimdump(`list ${outFiles[0].outFile}`)
            const allFilesArr = allFiles.split('\n')
            const mediaFiles = allFilesArr
              .filter((elem) => elem.endsWith('pdf') || elem.endsWith('png') || elem.endsWith('jpg') || elem.endsWith('webm') || elem.endsWith('ogg'))
              .sort()

            expect(mediaFiles).toEqual(
              [
                'Kiwix_-_WikiArabia_Cairo_2017.pdf',
                'Kiwix_Hackathon_2017_Florence_WikiFundi.webm.240p.vp9.webm',
                'Kiwix_Hackathon_2017_Florence_WikiFundi.webm.jpg',
                'Kiwix_icon.svg.png',
                'Local_Forecast_-_Elevator_(ISRC_USUAN1300012).mp3.ogg',
                'page1-120px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                'page1-1500px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
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

              const allFiles = await zimdump(`list ${dump.outFile}`)
              const allFilesArr = allFiles.split('\n')
              const mediaFiles = allFilesArr
                .filter((elem) => elem.endsWith('pdf') || elem.endsWith('png') || elem.endsWith('jpg') || elem.endsWith('webm') || elem.endsWith('ogg'))
                .sort()
              if (dump.nopic) {
                expect(mediaFiles).toEqual(
                  [
                    'Kiwix_-_WikiArabia_Cairo_2017.pdf',
                    // 'Kiwix_Hackathon_2017_Florence_WikiFundi.webm.120p.vp9.webm', // these files were omitted by nopic parameter
                    // 'Kiwix_Hackathon_2017_Florence_WikiFundi.webm.jpg',
                    // 'Kiwix_icon.svg.png',
                    // 'Local_Forecast_-_Elevator_(ISRC_USUAN1300012).mp3.ogg',
                    // 'page1-120px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                    // 'page1-1500px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                  ].sort(),
                )
              } else if (dump.novid) {
                expect(mediaFiles).toEqual(
                  [
                    'Kiwix_-_WikiArabia_Cairo_2017.pdf',
                    // 'Kiwix_Hackathon_2017_Florence_WikiFundi.webm.120p.vp9.webm', // these files were omitted by novid parameter
                    // 'Kiwix_Hackathon_2017_Florence_WikiFundi.webm.jpg',
                    'Kiwix_icon.svg.png',
                    // 'Local_Forecast_-_Elevator_(ISRC_USUAN1300012).mp3.ogg',
                    'page1-120px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                    'page1-1500px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                  ].sort(),
                )
              } else if (dump.nopdf) {
                expect(mediaFiles).toEqual(
                  [
                    // 'Kiwix_-_WikiArabia_Cairo_2017.pdf',  // this file was omitted by nopdf parameter
                    'Kiwix_Hackathon_2017_Florence_WikiFundi.webm.240p.vp9.webm',
                    'Kiwix_Hackathon_2017_Florence_WikiFundi.webm.jpg',
                    'Kiwix_icon.svg.png',
                    'Local_Forecast_-_Elevator_(ISRC_USUAN1300012).mp3.ogg',
                    'page1-120px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                    'page1-1500px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
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

              const allFiles = await zimdump(`list ${dump.outFile}`)
              const allFilesArr = allFiles.split('\n')
              const mediaFiles = allFilesArr
                .filter((elem) => elem.endsWith('pdf') || elem.endsWith('png') || elem.endsWith('jpg') || elem.endsWith('webm') || elem.endsWith('ogg'))
                .sort()
              if (dump.nopic) {
                expect(mediaFiles).toEqual(
                  [
                    'Kiwix_-_WikiArabia_Cairo_2017.pdf',
                    // 'Kiwix_Hackathon_2017_Florence_WikiFundi.webm.120p.vp9.webm', // these files were omitted by nopic parameter
                    // 'Kiwix_Hackathon_2017_Florence_WikiFundi.webm.jpg',
                    // 'Kiwix_icon.svg.png',
                    // 'Local_Forecast_-_Elevator_(ISRC_USUAN1300012).mp3.ogg',
                    // 'page1-120px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                    // 'page1-1500px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                  ].sort(),
                )
              } else if (dump.novid) {
                expect(mediaFiles).toEqual(
                  [
                    'Kiwix_-_WikiArabia_Cairo_2017.pdf',
                    // 'Kiwix_Hackathon_2017_Florence_WikiFundi.webm.120p.vp9.webm', // these files were omitted by novid parameter
                    // 'Kiwix_Hackathon_2017_Florence_WikiFundi.webm.jpg',
                    'Kiwix_icon.svg.png',
                    // 'Local_Forecast_-_Elevator_(ISRC_USUAN1300012).mp3.ogg',
                    'page1-120px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                    'page1-1500px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                  ].sort(),
                )
              } else if (dump.nopdf) {
                expect(mediaFiles).toEqual(
                  [
                    // 'Kiwix_-_WikiArabia_Cairo_2017.pdf',  // this file was omitted by nopdf parameter
                    'Kiwix_Hackathon_2017_Florence_WikiFundi.webm.240p.vp9.webm',
                    'Kiwix_Hackathon_2017_Florence_WikiFundi.webm.jpg',
                    'Kiwix_icon.svg.png',
                    'Local_Forecast_-_Elevator_(ISRC_USUAN1300012).mp3.ogg',
                    'page1-120px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
                    'page1-1500px-Kiwix_-_WikiArabia_Cairo_2017.pdf.jpg',
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
