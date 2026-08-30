import { isPageIgnored, filterPages } from '../../../src/util/mw-api.js'
import MediaWiki from '../../../src/MediaWiki.js'

describe('isPageIgnored and filterPages', () => {
  afterEach(() => {
    MediaWiki.case = 'first-letter'
  })

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

  test('isPageIgnored does not fold first letter on case-sensitive wikis', () => {
    MediaWiki.case = 'case-sensitive'
    const pagesToIgnore = ['Earth', 'main_page'] as PageTitle[]

    // Exact match matches
    expect(isPageIgnored('Earth', pagesToIgnore)).toBe(true)
    expect(isPageIgnored('main_page', pagesToIgnore)).toBe(true)

    // Space vs underscore normalization still works
    expect(isPageIgnored('main page', pagesToIgnore)).toBe(true)

    // First letter case difference does NOT match
    expect(isPageIgnored('earth', pagesToIgnore)).toBe(false)
    expect(isPageIgnored('Main_page', pagesToIgnore)).toBe(false)
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
