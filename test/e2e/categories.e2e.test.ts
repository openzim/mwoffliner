import { zimdump, zimcheck } from '../util.js'
import { testAllRenders } from '../testRenders.js'
import { jest } from '@jest/globals'
import { rimraf } from 'rimraf'
import 'dotenv/config.js'
import domino from 'domino'

jest.setTimeout(200000)

const parametersWithoutPagination = {
  mwUrl: 'https://bm.wikipedia.org',
  pageList: 'Bamanankan,Dibo,Kulibali,Dogoso,Espankan,Esperanto',
  adminEmail: 'test@kiwix.org',
  redis: process.env.REDIS,
  format: ['nopic'],
  getCategories: true,
}

const parametersWithPagination = {
  ...parametersWithoutPagination,
  categoriesPageSize: 2, // artificially low page size to "force" pagination
}

const expectedWpbmPages = [
  { page: 'Bamanankan', expectedCategories: ['Kan'] },
  { page: 'Dogoso', expectedCategories: ['Kan'] },
  { page: 'Espankan', expectedCategories: ['Kan'] },
  { page: 'Esperanto', expectedCategories: ['Kan'] },
  { page: 'Dibo', expectedCategories: ['Jamu'] },
  { page: 'Kulibali', expectedCategories: ['Jamu'] },
]

const performCategoriesTests = async (name, outFiles, expectedCategories, expectedPages) => {
  /**
   * Generic function to test a give ZIM categories handling
   */

  test(`${name} - test one ZIM created for ${outFiles[0]?.renderer} renderer`, async () => {
    expect(outFiles).toHaveLength(1)
  })

  test(`${name} - test ZIM integrity for ${outFiles[0]?.renderer} renderer`, async () => {
    await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrow()
  })

  for (const { page, expectedCategories } of expectedPages) {
    test(`${name} - check ${page} page for ${outFiles[0]?.renderer} renderer`, async () => {
      const allFiles = (await zimdump(`list ${outFiles[0].outFile}`)).split('\n')
      expect(allFiles).toContain(page)
      const content = await zimdump(`show --url ${page} ${outFiles[0].outFile}`)
      const document = domino.createDocument(content)
      const catlinksEl = document.querySelectorAll('div.catlinks ul a')
      expect(catlinksEl.length).toBeGreaterThanOrEqual(expectedCategories.length)
      const existingCategories = Array.from(catlinksEl).map((el) => el.textContent)
      for (const expectedCategory of expectedCategories) {
        expect(existingCategories).toContain(`${expectedCategory}`)
      }
    })
  }

  const allFiles = (await zimdump(`list ${outFiles[0].outFile}`)).split('\n')

  for (const { category, subcats, pages, files } of expectedCategories) {
    const categoryPath = `Catégorie:${category}`

    test(`${name} - check ${category} category for ${outFiles[0]?.renderer} renderer has item`, async () => {
      expect(allFiles).toContain(categoryPath)
    })

    const content = await zimdump(`show --url "${categoryPath}" ${outFiles[0].outFile}`)
    const document = domino.createDocument(content)

    for (const type of ['subcats', 'pages', 'files']) {
      const idName = type == 'subcats' ? 'mw-subcategories' : type == 'pages' ? 'mw-pages' : type == 'files' ? 'mw-category-media' : undefined
      const config = type == 'subcats' ? subcats : type == 'pages' ? pages : type == 'files' ? files : undefined
      const mwEl = document.querySelectorAll(`#${idName}`)

      test(`${name} - check ${category} category for ${outFiles[0]?.renderer} renderer ${type} parent HTML element`, () => {
        expect(mwEl.length).toBe(config ? 1 : 0)
      })

      const unexpectedPartial = config ? config.partials.length + 1 : 1
      test(`${name} - check ${category} category for ${outFiles[0]?.renderer} renderer ${type} has no unexpected partial`, () => {
        const categoryPath = `_categories_partials_Catégorie:${category}_${type}_${unexpectedPartial}`
        expect(allFiles).not.toContain(categoryPath)
      })

      if (!config) continue

      test(`${name} - check ${category} category for ${outFiles[0]?.renderer} renderer ${type} expected category groups`, () => {
        const catGroupsEl = Array.from(mwEl)[0].querySelectorAll('.mw-category-group')
        expect(catGroupsEl.length).toBe(config.nbGroups)
      })
      test(`${name} - check ${category} category for ${outFiles[0]?.renderer} renderer ${type} expected ul`, () => {
        const listsEl = Array.from(mwEl)[0].querySelectorAll('ul')
        expect(listsEl.length).toBe(config.nbGroups)
      })
      test(`${name} - check ${category} category for ${outFiles[0]?.renderer} renderer ${type} expected li`, () => {
        const pagesEl = Array.from(mwEl)[0].querySelectorAll('li')
        expect(pagesEl.length).toBe(config.nbLinks)
      })
      test(`${name} - check ${category} category for ${outFiles[0]?.renderer} renderer ${type} expected nextPrev`, () => {
        const nextPrevLink = Array.from(mwEl)[0].querySelectorAll('a.mwo-norewrite')
        expect(nextPrevLink.length).toBe(config.partials.length ? 2 : 0)
      })

      for (const { page, nbGroups, nbLinks } of config.partials) {
        test(`${name} - check ${category} category for ${outFiles[0]?.renderer} renderer ${type} partial page ${page}`, async () => {
          const categoryPath = `_categories_partials_Catégorie:${category}_${type}_${page}`
          const content = await zimdump(`show --url ${categoryPath} ${outFiles[0].outFile}`)
          const document = domino.createDocument(content)
          const mwPagesEl = document.querySelectorAll(`#${idName}`)
          expect(mwPagesEl.length).toBe(1)
          const catGroupsEl = Array.from(mwPagesEl)[0].querySelectorAll('.mw-category-group')
          expect(catGroupsEl.length).toBe(nbGroups)
          const listsEl = Array.from(mwPagesEl)[0].querySelectorAll('ul')
          expect(listsEl.length).toBe(nbGroups)
          const pagesEl = Array.from(mwPagesEl)[0].querySelectorAll('li')
          expect(pagesEl.length).toBe(nbLinks)
        })
      }
    }
  }
}

await testAllRenders('categories-without-pagination', parametersWithoutPagination, async (outFiles) => {
  // Run tests without pagination (all category have a single page, no pagination needed)

  const expectedCategories = [
    {
      category: 'Kan',
      subcats: {
        nbGroups: 1,
        nbLinks: 1,
        partials: [],
      },
      pages: {
        nbGroups: 3,
        nbLinks: 4,
        partials: [],
      },
      files: undefined,
    },
    { category: 'Jamu', subcats: undefined, pages: { nbGroups: 2, nbLinks: 2, partials: [] }, files: undefined },
  ]

  await performCategoriesTests('categories-with-pagination', outFiles, expectedCategories, expectedWpbmPages)

  afterAll(() => {
    if (!process.env.KEEP_ZIMS) {
      rimraf.sync(`./${outFiles[0].testId}`)
    }
  })
})

await testAllRenders('categories-with-pagination', parametersWithPagination, async (outFiles) => {
  // Run tests with pagination (one category has a single page, the other one need pagination for some element)

  const expectedCategories = [
    {
      category: 'Kan',
      subcats: {
        nbGroups: 1,
        nbLinks: 1,
        partials: [],
      },
      pages: {
        nbGroups: 2,
        nbLinks: 2,
        partials: [
          { page: 1, nbGroups: 2, nbLinks: 2 },
          { page: 2, nbGroups: 1, nbLinks: 2 },
        ],
      },
      files: undefined,
    },
    { category: 'Jamu', subcats: undefined, pages: { nbGroups: 2, nbLinks: 2, partials: [] }, files: undefined },
  ]

  await performCategoriesTests('categories-with-pagination', outFiles, expectedCategories, expectedWpbmPages)

  afterAll(() => {
    if (!process.env.KEEP_ZIMS) {
      rimraf.sync(`./${outFiles[0].testId}`)
    }
  })
})

const parametersWVFR = {
  mwUrl: 'https://fr.wikivoyage.org',
  pageList: 'Tanzanie,Madagascar',
  adminEmail: 'test@kiwix.org',
  redis: process.env.REDIS,
  format: ['nopic'],
  getCategories: true,
}

await testAllRenders('categories-tree-walk-up', parametersWVFR, async (outFiles) => {
  // Run tests on wikivoyage FR to check category tree walking up

  const expectedCategories = [
    {
      category: 'Afrique',
      subcats: {
        nbGroups: 1,
        nbLinks: 1,
        partials: [],
      },
      pages: undefined,
      files: undefined,
    },
    {
      category: "Afrique_de_l'Est",
      subcats: {
        nbGroups: 2,
        nbLinks: 2,
        partials: [],
      },
      pages: {
        nbGroups: 2,
        nbLinks: 2,
        partials: [],
      },
      files: undefined,
    },
  ]

  const expectedPages = [
    { page: 'Tanzanie', expectedCategories: ['Pays', 'Tanzanie', "Afrique de l'Est"] },
    { page: 'Madagascar', expectedCategories: ['Pays', 'Madagascar', "Afrique de l'Est"] },
  ]

  await performCategoriesTests('categories-tree-walk-up', outFiles, expectedCategories, expectedPages)

  afterAll(() => {
    if (!process.env.KEEP_ZIMS) {
      rimraf.sync(`./${outFiles[0].testId}`)
    }
  })
})
