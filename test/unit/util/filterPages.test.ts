import { isPageIgnored, filterPages } from '../../../src/util/mw-api.js'

describe('isPageIgnored and filterPages', () => {
  test('isPageIgnored matches case-insensitive first letter and space/underscore variations', () => {
    const pagesToIgnore = ['Earth', 'main_page', 'Solar System'] as PageTitle[]

    // Exact matches
    expect(isPageIgnored('Earth', pagesToIgnore)).toBe(true)
    expect(isPageIgnored('main_page', pagesToIgnore)).toBe(true)
    expect(isPageIgnored('Solar System', pagesToIgnore)).toBe(true)

    // Case-insensitive first letter
    expect(isPageIgnored('earth', pagesToIgnore)).toBe(true)
    expect(isPageIgnored('Main_page', pagesToIgnore)).toBe(true)
    expect(isPageIgnored('solar System', pagesToIgnore)).toBe(true)

    // Space vs underscore normalization
    expect(isPageIgnored('Main page', pagesToIgnore)).toBe(true)
    expect(isPageIgnored('main page', pagesToIgnore)).toBe(true)
    expect(isPageIgnored('Solar_System', pagesToIgnore)).toBe(true)
    expect(isPageIgnored('solar_System', pagesToIgnore)).toBe(true)

    // Non-matching page
    expect(isPageIgnored('Mars', pagesToIgnore)).toBe(false)
    expect(isPageIgnored('EARTH', pagesToIgnore)).toBe(false)
  })

  test('filterPages correctly removes ignored pages with case-insensitive first letter', () => {
    const pagesToIgnore = ['earth', 'Solar_System'] as PageTitle[]
    const mockPages: any = [
      { title: 'Earth', contentmodel: 'wikitext', revisions: [{ revid: 1 }] },
      { title: 'Mars', contentmodel: 'wikitext', revisions: [{ revid: 2 }] },
      { title: 'Solar System', contentmodel: 'wikitext', revisions: [{ revid: 3 }] },
    ]

    const result = filterPages(mockPages, pagesToIgnore, ['wikitext'])
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Mars')
  })
})
