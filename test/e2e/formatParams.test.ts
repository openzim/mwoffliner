import 'dotenv/config.js'
import domino from 'domino'
import { testAllRenders } from '../testRenders.js'
import { jest } from '@jest/globals'
import { zimdump } from '../util.js'
import { rimraf } from 'rimraf'
import { execa } from 'execa'

jest.setTimeout(200000)

const parameters = {
  mwUrl: 'https://en.wikipedia.org',
  adminEmail: 'mail@mail.com',
  redis: process.env.REDIS,
}

await testAllRenders('format-params-nopic', { ...parameters, format: 'nopic', pageList: 'BMW' }, async (outFiles) => {
  describe('format:nopic', () => {
    test(`Test en.wikipedia.org using format:nopic for ${outFiles[0]?.renderer} renderer`, async () => {
      await execa('redis-cli flushall', { shell: true })
      const pageFromDump = await zimdump(`show --url BMW ${outFiles[0].outFile}`)
      const pageDoc = domino.createDocument(pageFromDump)

      const imgElements = Array.from(pageDoc.querySelectorAll('img'))
      const nonMathImages = imgElements.filter((img) => {
        const className = img.getAttribute('class') || ''
        return !className.includes('mwe-math-fallback-image-inline') && img.getAttribute('typeof') !== 'mw:Extension/math'
      })

      expect(imgElements.length).toBeGreaterThan(0)
      expect(nonMathImages.length).toBeGreaterThan(0)
      expect(nonMathImages.every((img) => (img.getAttribute('src') || '').startsWith('data:image/svg+xml'))).toBe(true)
      expect(nonMathImages.every((img) => !(img.getAttribute('src') || '').includes('_assets_/'))).toBe(true)
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  })
})

await testAllRenders('format-params-nodet', { ...parameters, format: 'nodet', pageList: 'BMW' }, async (outFiles) => {
  describe('format:nodet', () => {
    test(`Test en.wikipedia.org using format:nodet for ${outFiles[0]?.renderer} renderer`, async () => {
      await execa('redis-cli flushall', { shell: true })
      const pageFromDump = await zimdump(`show --url BMW ${outFiles[0].outFile}`)
      const pageDoc = domino.createDocument(pageFromDump)

      const headings = Array.from(pageDoc.querySelectorAll('.mw-heading'))
      const infoboxes = Array.from(pageDoc.querySelectorAll('table.infobox'))
      const paragraphs = Array.from(pageDoc.querySelectorAll('p'))

      expect(headings).toHaveLength(0)
      expect(infoboxes).toHaveLength(1)
      expect(paragraphs.length).toBeGreaterThan(1)
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  })
})

await testAllRenders('format-params-novid-1', { ...parameters, format: 'novid', pageList: 'Animation' }, async (outFiles) => {
  describe('format:novid to check no video tags', () => {
    test(`Test en.wikipedia.org using format:novid for ${outFiles[0]?.renderer} renderer (no video)`, async () => {
      await execa('redis-cli flushall', { shell: true })
      const pageFromDump = await zimdump(`show --url Animation ${outFiles[0].outFile}`)
      const pageDoc = domino.createDocument(pageFromDump)

      const audioElements = Array.from(pageDoc.querySelectorAll('audio'))

      expect(audioElements).toHaveLength(0)
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  })
})

await testAllRenders('format-params-novid-2', { ...parameters, format: 'novid', pageList: 'English_alphabet' }, async (outFiles) => {
  describe('format:novid to check no audio tags', () => {
    test(`Test en.wikipedia.org using format:novid for ${outFiles[0]?.renderer} renderer (no audio)`, async () => {
      await execa('redis-cli flushall', { shell: true })
      const pageFromDump = await zimdump(`show --url English_alphabet ${outFiles[0].outFile}`)
      const pageDoc = domino.createDocument(pageFromDump)

      const videoElements = Array.from(pageDoc.querySelectorAll('video'))

      expect(videoElements).toHaveLength(0)
      if (!process.env.KEEP_ZIMS) {
        rimraf.sync(`./${outFiles[0].testId}`)
      }
    })
  })
})
