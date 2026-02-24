import { testAllRenders } from '../testRenders.js'
import { zimdump, zimcheck } from '../util.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'
import domino from 'domino'

jest.setTimeout(60000)

await testAllRenders(
  'wiktionary',
  {
    mwUrl: 'https://en.wiktionary.org',
    // fetch index article which will cause a conflict with default index page
    // fetch favicon article which will cause a conflict with former favicon illustration
    // fetch maison article to test audio behavior
    articleList: 'index,location,favicon,maison',
    adminEmail: 'test@kiwix.org',
  },
  async (outFiles) => {
    test(`test ZIM integrity for ${outFiles[0]?.renderer} renderer`, async () => {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
      expect(outFiles[0].status.articles.success).toEqual(4)
      expect(outFiles[0].status.articles.hardFail).toEqual(0)
      expect(outFiles[0].status.articles.softFail).toEqual(0)
    })

    test(`test audio files for ${outFiles[0]?.renderer} renderer`, async () => {
      const allFiles = await zimdump(`list ${outFiles[0].outFile}`)
      const allFilesArr = allFiles.split('\n')
      const mediaFiles = allFilesArr.filter((elem) => elem.endsWith('webm') || elem.endsWith('ogg')).sort()

      expect(mediaFiles).toEqual(
        [
          '_assets_/0c70a452f799bfe840676ee341124611/Cs-index.ogg',
          '_assets_/0c70a452f799bfe840676ee341124611/En-au-favicon.ogg',
          '_assets_/0c70a452f799bfe840676ee341124611/En-us-index.ogg',
          '_assets_/0c70a452f799bfe840676ee341124611/En-us-location.ogg',
          '_assets_/0c70a452f799bfe840676ee341124611/Fr-une_maison-fr-ouest.ogg',
          '_assets_/0c70a452f799bfe840676ee341124611/LL-Q150_(fra)-Jérémy-Günther-Heinz_Jähnick-index.wav.ogg',
          '_assets_/0c70a452f799bfe840676ee341124611/LL-Q150_(fra)-Jérémy-Günther-Heinz_Jähnick-maison.wav.ogg',
          '_assets_/0c70a452f799bfe840676ee341124611/LL-Q150_(fra)-Lepticed7-index.wav.ogg',
          '_assets_/0c70a452f799bfe840676ee341124611/LL-Q150_(fra)-LoquaxFR-index.wav.ogg',
          '_assets_/0c70a452f799bfe840676ee341124611/LL-Q150_(fra)-LoquaxFR-maison.wav.ogg',
          '_assets_/0c70a452f799bfe840676ee341124611/LL-Q150_(fra)-Poslovitch-location.wav.ogg',
          '_assets_/0c70a452f799bfe840676ee341124611/LL-Q150_(fra)-Poslovitch-maison.wav.ogg',
          '_assets_/0c70a452f799bfe840676ee341124611/LL-Q150_(fra)-WikiLucas00-location.wav.ogg',
          '_assets_/0c70a452f799bfe840676ee341124611/LL-Q150_(fra)-WikiLucas00-maison.wav.ogg',
          '_assets_/0c70a452f799bfe840676ee341124611/Nl-index.ogg',
        ].sort(),
      )
    })

    test(`test maison article content for ${outFiles[0]?.renderer} renderer`, async () => {
      const maisonArticleContent = await zimdump(`show --url maison ${outFiles[0].outFile}`)
      const maisonArticleDoc = domino.createDocument(maisonArticleContent)
      const sourcesEl = maisonArticleDoc.querySelectorAll('source')
      expect(sourcesEl.length).toBe(5)
      for (const sourceEl of Array.from(sourcesEl)) {
        expect(sourceEl.getAttribute('src').startsWith('./_assets_/0c70a452f799bfe840676ee341124611/')).toBeTruthy()
      }
    })

    test(`test index article content for ${outFiles[0]?.renderer} renderer`, async () => {
      const indexArticleContent = await zimdump(`show --url index ${outFiles[0].outFile}`)
      const indexArticleDoc = domino.createDocument(indexArticleContent)
      const sourcesEl = indexArticleDoc.querySelectorAll('source')
      expect(sourcesEl.length).toBe(6)
      for (const sourceEl of Array.from(sourcesEl)) {
        expect(sourceEl.getAttribute('src').startsWith('./_assets_/0c70a452f799bfe840676ee341124611/')).toBeTruthy()
      }
    })

    afterAll(() => {
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  },
)
