import { isPageIgnored, filterPages } from '../../../src/util/mw-api.js'
import MediaWiki from '../../../src/MediaWiki.js'

describe('isPageIgnored and filterPages', () => {
  afterEach(() => {
    MediaWiki.case = 'first-letter'
  })

  test('isPageIgnored matches case-insensitive first letter', () => {
    const pagesToIgnore = ['Earth', 'Main page', 'Solar System'] as PageTitle[]

    // Exact matches
    expect(isPageIgnored('Earth' as PageTitle, pagesToIgnore)).toBe(true)
    expect(isPageIgnored('Main page' as PageTitle, pagesToIgnore)).toBe(true)
    expect(isPageIgnored('Solar System' as PageTitle, pagesToIgnore)).toBe(true)

    // Case-insensitive first letter
    expect(isPageIgnored('earth' as PageTitle, pagesToIgnore)).toBe(true)
    expect(isPageIgnored('main page' as PageTitle, pagesToIgnore)).toBe(true)
    expect(isPageIgnored('solar System' as PageTitle, pagesToIgnore)).toBe(true)

    // Non-matching page
    expect(isPageIgnored('Mars' as PageTitle, pagesToIgnore)).toBe(false)
    expect(isPageIgnored('EARTH' as PageTitle, pagesToIgnore)).toBe(false)
  })

  test('isPageIgnored does not fold first letter on case-sensitive wikis', () => {
    MediaWiki.case = 'case-sensitive'
    const pagesToIgnore = ['Earth', 'Main page'] as PageTitle[]

    // Exact match matches
    expect(isPageIgnored('Earth' as PageTitle, pagesToIgnore)).toBe(true)
    expect(isPageIgnored('Main page' as PageTitle, pagesToIgnore)).toBe(true)

    // First letter case difference does NOT match
    expect(isPageIgnored('earth' as PageTitle, pagesToIgnore)).toBe(false)
    expect(isPageIgnored('main page' as PageTitle, pagesToIgnore)).toBe(false)
  })

  test('filterPages correctly removes ignored pages with case-insensitive first letter', () => {
    const pagesToIgnore = ['earth', 'Solar System'] as PageTitle[]
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
