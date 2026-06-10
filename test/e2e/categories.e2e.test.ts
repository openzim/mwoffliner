import { zimdump, zimcheck } from '../util.js'
import { testAllRenders } from '../testRenders.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'
import 'dotenv/config.js'
import domino from 'domino'

jest.setTimeout(200000)

const parameters = {
  mwUrl: 'https://bm.wikipedia.org',
  articleList: 'Bamanankan,Dibo,Kulibali,Dogoso,Espankan,Esperanto',
  adminEmail: 'test@kiwix.org',
  redis: process.env.REDIS,
  format: ['nopic'],
  getCategories: true,
}

await testAllRenders('categories', parameters, async (outFiles) => {
  test(`test one ZIM created for ${outFiles[0]?.renderer} renderer`, async () => {
    expect(outFiles).toHaveLength(1)
  })

  test(`test ZIM integrity for ${outFiles[0]?.renderer} renderer`, async () => {
    await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
  })

  for (const { article, expectedCategory } of [
    { article: 'Bamanankan', expectedCategory: 'Kan' },
    { article: 'Dogoso', expectedCategory: 'Kan' },
    { article: 'Espankan', expectedCategory: 'Kan' },
    { article: 'Esperanto', expectedCategory: 'Kan' },
    { article: 'Dibo', expectedCategory: 'Jamu' },
    { article: 'Kulibali', expectedCategory: 'Jamu' },
  ]) {
    test(`check ${article} article for ${outFiles[0]?.renderer} renderer`, async () => {
      const allFiles = (await zimdump(`list ${outFiles[0].outFile}`)).split('\n')
      expect(allFiles).toContain(article)
      const content = await zimdump(`show --url ${article} ${outFiles[0].outFile}`)
      const document = domino.createDocument(content)
      const catlinksEl = document.querySelectorAll('.catlinks')
      expect(catlinksEl.length).toBe(1)
      // eslint-disable-next-line no-irregular-whitespace
      expect(Array.from(catlinksEl)[0].textContent).toBe(`Catégorie : ${expectedCategory}`)
    })
  }

  for (const { category, expectedCategoryGroups, expectedPages, expectedSubCats } of [
    { category: 'Kan', expectedCategoryGroups: 3, expectedPages: 4, expectedSubCats: 1 },
    { category: 'Jamu', expectedCategoryGroups: 2, expectedPages: 2, expectedSubCats: 0 },
  ]) {
    test(`check ${category} category for ${outFiles[0]?.renderer} renderer`, async () => {
      const allFiles = (await zimdump(`list ${outFiles[0].outFile}`)).split('\n')
      const categoryPath = `Catégorie:${category}`
      expect(allFiles).toContain(categoryPath)
      const content = await zimdump(`show --url ${categoryPath} ${outFiles[0].outFile}`)
      const document = domino.createDocument(content)

      const mwSubCatEl = document.querySelectorAll('#mw-subcategories')
      expect(mwSubCatEl.length).toBe(expectedSubCats > 0 ? 1 : 0)
      if (expectedSubCats > 0) {
        const subcatGroupsEl = Array.from(mwSubCatEl)[0].querySelectorAll('.mw-category-group')
        expect(subcatGroupsEl.length).toBe(expectedSubCats)
        const subCatsPagesEl = Array.from(mwSubCatEl)[0].querySelectorAll('li')
        expect(subCatsPagesEl.length).toBe(expectedSubCats)
      }

      const mwPagesEl = document.querySelectorAll('#mw-pages')
      expect(mwPagesEl.length).toBe(1)
      const catGroupsEl = Array.from(mwPagesEl)[0].querySelectorAll('.mw-category-group')
      expect(catGroupsEl.length).toBe(expectedCategoryGroups)
      const listsEl = Array.from(mwPagesEl)[0].querySelectorAll('ul')
      expect(listsEl.length).toBe(expectedCategoryGroups)
      const pagesEl = Array.from(mwPagesEl)[0].querySelectorAll('li')
      expect(pagesEl.length).toBe(expectedPages)
    })
  }

  afterAll(() => {
    if (!process.env.KEEP_ZIMS) {
      rimraf.sync(`./${outFiles[0].testId}`)
    }
  })
})
