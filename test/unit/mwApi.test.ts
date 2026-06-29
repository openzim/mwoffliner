import { startRedis, stopRedis } from './bootstrap.js'
import Downloader from '../../src/Downloader.js'
import MediaWiki, { SiteInfoSkin } from '../../src/MediaWiki.js'
import RedisStore from '../../src/RedisStore.js'
import { getPages, mwRetToPageDetail } from '../../src/util/mw-api.js'
import { getPagesByNamespace } from '../../src/util/index.js'
import { config } from '../../src/config.js'
import { jest } from '@jest/globals'

jest.setTimeout(10000)

beforeAll(async () => {
  MediaWiki.reset()
  await startRedis()
})
afterAll(stopRedis)

const initMW = async () => {
  await MediaWiki.getMwMetaData()
  await MediaWiki.hasCoordinates()
}

describe('mwApi', () => {
  beforeEach(async () => {
    await RedisStore.pagesStore.flush()

    MediaWiki.base = 'https://en.wikipedia.org'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, workers: 1, reqTimeout: 1000 * 60, webp: false, optimisationCacheUrl: '' }

    await initMW()
  })

  test('MWApi Page Title', async () => {
    const pageList = ['London', 'United_Kingdom', 'Farnborough/Aldershot built-up area']
    const pagesTitles = ['London', 'United Kingdom', 'Farnborough/Aldershot built-up area']

    await getPages('Main_Page' as PageTitle, pageList as PageTitle[])

    const pagesByTitle = await RedisStore.pagesStore.getMany(pagesTitles)
    const London = pagesByTitle['London']
    const United_Kingdom = pagesByTitle['United Kingdom']
    const Farnborough = pagesByTitle['Farnborough/Aldershot built-up area']

    // Page "United_Kingdom" was scraped
    expect(United_Kingdom).toBeDefined()

    // Page "United_Kingdom" has thumbnail
    expect(United_Kingdom).toHaveProperty('thumbnail')

    // Page "United_Kingdom" has revision
    expect(United_Kingdom).toHaveProperty('revisionId')

    // Page "London" was scraped
    expect(London).toBeDefined()

    // Page "London" has geo coords
    expect(London).toHaveProperty('coordinates')

    // Complex page was scraped
    expect(Farnborough).toBeDefined()
  })

  test('MWApi NS', async () => {
    await getPagesByNamespace(0, [], ['wikitext'], new Set(), 5) // Get 5 continues/pages of NSes
    const pageTitles = ['"...And Ladies of the Club"', '"Khan gizi" spring']
    const pages = await RedisStore.pagesStore.getMany(pageTitles)
    const PageWithRevisions = pages['"...And Ladies of the Club"']
    const PageWithCoordinates = pages['"Khan gizi" spring']

    // Pages have been retrieved
    expect(PageWithRevisions).not.toBeNull()
    expect(PageWithCoordinates).not.toBeNull()

    // page has revision
    expect(PageWithRevisions).toHaveProperty('revisionId')

    // page has coordinates'
    expect(PageWithCoordinates).toHaveProperty('coordinates')

    // Got items in namespaces
    expect(Object.keys(MediaWiki.namespaces).length).toBeGreaterThan(0)

    let keysAreValid = true
    Object.values(MediaWiki.namespaces).forEach((item) => {
      if (!Object.keys(item).includes('num') || !Object.keys(item).includes('allowedSubpages') || !Object.keys(item).includes('isContent')) keysAreValid = false
    })
    // Namespaces have valid keys
    expect(keysAreValid).toBeTruthy()
  })

  describe('extracting title from href', () => {
    test('title with wiki', () => {
      const titleWithWiki = MediaWiki.extractPageTitleFromHref('/wiki/Hades')
      // Title with hrefs contaning /wiki
      expect(titleWithWiki).toEqual('Hades')
    })

    test('title with relative path', () => {
      const titleWithRelativePath = MediaWiki.extractPageTitleFromHref('./Damage_Formula')
      // Title with relative path
      expect(titleWithRelativePath).toEqual('Damage Formula')
    })

    test('title with two dir', () => {
      const titleWithTwoDir = MediaWiki.extractPageTitleFromHref('../../Mali_Dung')
      // Title with two dir path
      expect(titleWithTwoDir).toEqual('Mali Dung')
    })

    test('title with anchor jump', () => {
      const titleWithAnchorJump = MediaWiki.extractPageTitleFromHref('./Subarns#Mali')
      // Title with Anchor Jump
      expect(titleWithAnchorJump).toEqual('Subarns')
    })

    test('inter wiki title', () => {
      const interWikiTitle = MediaWiki.extractPageTitleFromHref('Maldives')
      // Interwiki title
      expect(interWikiTitle).toBeNull()
    })

    test('red link', () => {
      const relativeRedLink = MediaWiki.extractPageTitleFromHref('./Nanmangalam?action=edit&redlink=1')
      // A red link which is relative
      expect(relativeRedLink).toEqual('Nanmangalam')
    })

    test('absolute index path', () => {
      const absoluteIndexPath = MediaWiki.extractPageTitleFromHref('/w/index.php?title=Blue_whale1')
      // A link to index.php
      expect(absoluteIndexPath).toEqual('Blue whale1')
    })

    test('absolute index path red link', () => {
      const absoluteIndexPathRedLink = MediaWiki.extractPageTitleFromHref('/w/index.php?action=edit&title=Blue_whale2&redlink=1')
      // A red link to index.php
      expect(absoluteIndexPathRedLink).toEqual('Blue whale2')
    })

    test('absolute index path no title', () => {
      const absoluteIndexPathNoTitle = MediaWiki.extractPageTitleFromHref('/w/index.php?action=edit&redlink=1')
      // An index.php link missing the page title
      expect(absoluteIndexPathNoTitle).toBeNull()
    })

    test('full URL', () => {
      const fullUrl = MediaWiki.extractPageTitleFromHref('https://en.wikipedia.org/wiki/Blue_whale')
      // test for a complete  URL
      expect(fullUrl).toBe('Blue whale')
    })

    test('encoded url', () => {
      const encodedUrl = MediaWiki.extractPageTitleFromHref('/wiki/Radio_Rom%C3%A2nia_Actualit%C4%83%C8%9Bi')
      // URL with special encoded characters
      expect(encodedUrl).toBe('Radio România Actualități')
    })

    test('empty input', () => {
      const emptyInput = MediaWiki.extractPageTitleFromHref('')
      // Empty input should return null
      expect(emptyInput).toBeNull()
    })
  })
})

describe('Test blacklisted NSs', () => {
  beforeEach(async () => {
    await RedisStore.pagesStore.flush()

    MediaWiki.base = 'https://id.wikipedia.org'
    MediaWiki.getCategories = true

    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, workers: 1, reqTimeout: 1000 * 60, webp: false, optimisationCacheUrl: '' }

    await initMW()
  })

  test('Prevent blacklisted namespaces to mirroring', async () => {
    const aIds = ['Story:Satelit_Oberon', 'London']
    await getPages('Main_Page' as PageTitle, aIds as PageTitle[])

    expect(MediaWiki.namespacesToMirror).not.toContain('Story')
  })
})

describe('Test moved page with redirect', () => {
  beforeEach(async () => {
    await RedisStore.pagesStore.flush()

    MediaWiki.base = 'https://es.wikipedia.org'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, workers: 1, reqTimeout: 1000 * 60, webp: false, optimisationCacheUrl: '' }

    await initMW()
  })

  test('Moved Page Ids', async () => {
    const pageTitles = ['Alejandro González y Robleto', 'Vicente Alejandro González y Robleto']

    await getPages(null, pageTitles as PageTitle[])

    const pages = await RedisStore.pagesStore.getMany(pageTitles)
    const Alejandro_González_y_Robleto = pages['Alejandro González y Robleto']
    const Vicente_Alejandro_González_y_Robleto = pages['Vicente Alejandro González y Robleto']

    // Page "Alejandro_González_y_Robleto" has been moved so it is not fetched
    expect(Alejandro_González_y_Robleto).toBeNull()

    // Page "Vicente_Alejandro_González_y_Robleto" is defined and has a title and a revisionId
    expect(Vicente_Alejandro_González_y_Robleto).toBeDefined()
    expect(Vicente_Alejandro_González_y_Robleto).toHaveProperty('title')
    expect(Vicente_Alejandro_González_y_Robleto).toHaveProperty('revisionId')
  })
})

describe('Mediawiki utils', () => {
  test.each([
    [
      // Standard test case
      [
        { code: 'vector', name: 'Vector Legacy' },
        { code: 'vector-2022', name: 'Vector (2022)', default: true },
        { code: 'modern', name: 'Modern', unusable: true },
      ],
      'vector-2022',
    ],
    [
      // Edge-case where we have two default skin
      [
        { code: 'vector-2022', name: 'Vector (2022)', default: true },
        { code: 'vector', name: 'Vector Legacy', default: true },
      ],
      'vector-2022',
    ],
  ])('Get skin', (skins: SiteInfoSkin[], defaultSkin: string) => {
    expect(MediaWiki.getDefaultSkin(skins)).toBe(defaultSkin)
  })

  test.each([
    [
      // No default skin
      [
        { code: 'vector', name: 'Vector Legacy' },
        { code: 'vector-2022', name: 'Vector (2022)' },
        { code: 'modern', name: 'Modern', unusable: true },
      ],
    ],
  ])('Get skin', (skins: SiteInfoSkin[]) => {
    expect(() => MediaWiki.getDefaultSkin(skins)).toThrow()
  })
})

describe('mwRetToPageDetail — FlaggedRevs stableRevisionId extraction', () => {
  test('extracts stableRevisionId when flagged.stable_revid is present', () => {
    const mockQueryRet: QueryMwRet = [
      {
        title: 'Berlin' as PageTitle,
        ns: 0,
        contentmodel: 'wikitext',
        revisions: [{ revid: 200, parentid: 199, minor: '', user: 'TestUser', timestamp: '2024-01-01T00:00:00Z', comment: '' }],
        flagged: {
          stable_revid: 180,
          level: 0,
          level_text: 'stable',
        },
      } as any,
    ]

    const result = mwRetToPageDetail(mockQueryRet)

    expect(result.Berlin).toBeDefined()
    expect(result.Berlin.revisionId).toBe(200)
    expect(result.Berlin.stableRevisionId).toBe(180)
  })

  test('does not include stableRevisionId when flagged data is absent', () => {
    const mockQueryRet: QueryMwRet = [
      {
        title: 'London' as PageTitle,
        ns: 0,
        contentmodel: 'wikitext',
        revisions: [{ revid: 100, parentid: 99, minor: '', user: 'SomeUser', timestamp: '2024-01-01T00:00:00Z', comment: '' }],
      } as any,
    ]

    const result = mwRetToPageDetail(mockQueryRet)

    expect(result.London).toBeDefined()
    expect(result.London.revisionId).toBe(100)
    expect(result.London.stableRevisionId).toBeUndefined()
  })

  test('does not include stableRevisionId when flagged exists but stable_revid is missing', () => {
    const mockQueryRet: QueryMwRet = [
      {
        title: 'Paris' as PageTitle,
        ns: 0,
        contentmodel: 'wikitext',
        revisions: [{ revid: 300, parentid: 299, minor: '', user: 'Editor', timestamp: '2024-06-01T00:00:00Z', comment: '' }],
        flagged: {
          level: 1,
          level_text: 'quality',
        },
      } as any,
    ]

    const result = mwRetToPageDetail(mockQueryRet)

    expect(result.Paris).toBeDefined()
    expect(result.Paris.revisionId).toBe(300)
    expect(result.Paris.stableRevisionId).toBeUndefined()
  })

  test('handles mix of pages with and without FlaggedRevs data', () => {
    const mockQueryRet: QueryMwRet = [
      {
        title: 'München' as PageTitle,
        ns: 0,
        contentmodel: 'wikitext',
        revisions: [{ revid: 500, parentid: 499, minor: '', user: 'DEUser', timestamp: '2024-03-01T00:00:00Z', comment: '' }],
        flagged: { stable_revid: 490 },
      } as any,
      {
        title: 'Tokyo' as PageTitle,
        ns: 0,
        contentmodel: 'wikitext',
        revisions: [{ revid: 600, parentid: 599, minor: '', user: 'JPUser', timestamp: '2024-03-01T00:00:00Z', comment: '' }],
      } as any,
    ]

    const result = mwRetToPageDetail(mockQueryRet)

    expect(result['München'].stableRevisionId).toBe(490)
    expect(result['München'].revisionId).toBe(500)
    expect(result.Tokyo.stableRevisionId).toBeUndefined()
    expect(result.Tokyo.revisionId).toBe(600)
  })

  test('handles stableRevisionId equal to latest revisionId (both should be set)', () => {
    const mockQueryRet: QueryMwRet = [
      {
        title: 'Hamburg' as PageTitle,
        ns: 0,
        contentmodel: 'wikitext',
        revisions: [{ revid: 400, parentid: 399, minor: '', user: 'User1', timestamp: '2024-02-01T00:00:00Z', comment: '' }],
        flagged: { stable_revid: 400 },
      } as any,
    ]

    const result = mwRetToPageDetail(mockQueryRet)

    expect(result.Hamburg.revisionId).toBe(400)
    expect(result.Hamburg.stableRevisionId).toBe(400)
  })
})
