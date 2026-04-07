import { startRedis, stopRedis } from './bootstrap.js'
import Downloader from '../../src/Downloader.js'
import MediaWiki, { SiteInfoSkin } from '../../src/MediaWiki.js'
import RedisStore from '../../src/RedisStore.js'
import { getArticleIds, mwRetToArticleDetail } from '../../src/util/mw-api.js'
import { getArticlesByNS } from '../../src/util/index.js'
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
    await RedisStore.articleDetailXId.flush()

    MediaWiki.base = 'https://en.wikipedia.org'
    MediaWiki.getCategories = true
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: false, optimisationCacheUrl: '' }

    await initMW()
  })

  test('MWApi Article Ids', async () => {
    const aIds = ['London', 'United_Kingdom', 'Farnborough/Aldershot_built-up_area']

    await getArticleIds('Main_Page', aIds)

    const articlesById = await RedisStore.articleDetailXId.getMany(aIds)
    const { United_Kingdom, London } = articlesById

    // Article "United_Kingdom" was scraped
    expect(United_Kingdom).toBeDefined()

    // Article "United_Kingdom" has categories
    expect(United_Kingdom?.categories?.length).toBeGreaterThanOrEqual(11)

    // Article "United_Kingdom" has thumbnail
    expect(United_Kingdom).toHaveProperty('thumbnail')

    // Article "United_Kingdom" has revision
    expect(United_Kingdom).toHaveProperty('revisionId')

    // Article "London" was scraped
    expect(London).toBeDefined()

    // Article "London" has geo coords
    expect(London).toHaveProperty('coordinates')

    // Complex article was scraped
    expect(articlesById).toHaveProperty('Farnborough/Aldershot_built-up_area')
  })

  test('MWApi NS', async () => {
    await getArticlesByNS(0, undefined, ['wikitext'], 5) // Get 5 continues/pages of NSes
    const interestingAIds = ['"...And_Ladies_of_the_Club"', '"Khan_gizi"_spring']
    const articles = await RedisStore.articleDetailXId.getMany(interestingAIds)
    const ArticleWithRevisionsAndCategory = articles['"...And_Ladies_of_the_Club"']
    const ArticleWithCoordinates = articles['"Khan_gizi"_spring']

    // Articles have been retrieved
    expect(ArticleWithRevisionsAndCategory).not.toBeNull()
    expect(ArticleWithCoordinates).not.toBeNull()

    // article has categories
    expect(ArticleWithRevisionsAndCategory?.categories?.length).toBeGreaterThan(0)

    // article has revision
    expect(ArticleWithRevisionsAndCategory).toHaveProperty('revisionId')

    // article has coordinates'
    expect(ArticleWithCoordinates).toHaveProperty('coordinates')

    // Got items in namespaces
    expect(Object.keys(MediaWiki.namespaces).length).toBeGreaterThan(0)

    let keysAreValid = true
    Object.values(MediaWiki.namespaces).forEach((item) => {
      if (!Object.keys(item).includes('num') || !Object.keys(item).includes('allowedSubpages') || !Object.keys(item).includes('isContent')) keysAreValid = false
    })
    // Namespaces have valid keys
    expect(keysAreValid).toBeTruthy()
  })

  test('extracting title from href', () => {
    const titleWithWiki = MediaWiki.extractPageTitleFromHref('/wiki/Hades')
    // Title with hrefs contaning /wiki
    expect(titleWithWiki).toEqual('Hades')

    const titleWithRelativePath = MediaWiki.extractPageTitleFromHref('./Damage_Formula')
    // Title with relative path
    expect(titleWithRelativePath).toEqual('Damage_Formula')

    const titleWithTwoDir = MediaWiki.extractPageTitleFromHref('../../Mali_Dung')
    // Title with two dir path
    expect(titleWithTwoDir).toEqual('Mali_Dung')

    const titleWithAnchorJump = MediaWiki.extractPageTitleFromHref('./Subarns#Mali')
    // Title with Anchor Jump
    expect(titleWithAnchorJump).toEqual('Subarns')

    const interWikiTitle = MediaWiki.extractPageTitleFromHref('Maldives')
    // Interwiki title
    expect(interWikiTitle).toBeNull()

    const relativeRedLink = MediaWiki.extractPageTitleFromHref('./Nanmangalam?action=edit&redlink=1')
    // A red link which is relative
    expect(relativeRedLink).toEqual('Nanmangalam')

    const absoluteIndexPath = MediaWiki.extractPageTitleFromHref('/w/index.php?title=Blue_whale1')
    // A link to index.php
    expect(absoluteIndexPath).toEqual('Blue_whale1')

    const absoluteIndexPathRedLink = MediaWiki.extractPageTitleFromHref('/w/index.php?action=edit&title=Blue_whale2&redlink=1')
    // A red link to index.php
    expect(absoluteIndexPathRedLink).toEqual('Blue_whale2')

    const absoluteIndexPathNoTitle = MediaWiki.extractPageTitleFromHref('/w/index.php?action=edit&redlink=1')
    // An index.php link missing the article title
    expect(absoluteIndexPathNoTitle).toBeNull()

    const fullUrl = MediaWiki.extractPageTitleFromHref('https://en.wikipedia.org/wiki/Blue_whale')
    // test for a complete  URL
    expect(fullUrl).toBe('Blue_whale')

    const encodedUrl = MediaWiki.extractPageTitleFromHref('/wiki/Radio_Rom%C3%A2nia_Actualit%C4%83%C8%9Bi')
    // URL with special encoded characters
    expect(encodedUrl).toBe('Radio_România_Actualități')

    const emptyInput = MediaWiki.extractPageTitleFromHref('')
    // Empty input should return null
    expect(emptyInput).toBeNull()
  })
})

describe('Test blacklisted NSs', () => {
  beforeEach(async () => {
    await RedisStore.articleDetailXId.flush()

    MediaWiki.base = 'https://id.wikipedia.org'
    MediaWiki.getCategories = true

    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: false, optimisationCacheUrl: '' }

    await initMW()
  })

  test('Prevent blacklisted namespaces to mirroring', async () => {
    const aIds = ['Story:Satelit_Oberon', 'London']
    await getArticleIds('Main_Page', aIds)

    expect(MediaWiki.namespacesToMirror).not.toContain('Story')
  })
})

describe('Test moved page with redirect', () => {
  beforeEach(async () => {
    await RedisStore.articleDetailXId.flush()

    MediaWiki.base = 'https://es.wikipedia.org'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: false, optimisationCacheUrl: '' }

    await initMW()
  })

  test('Moved Article Ids', async () => {
    const aIds = ['Alejandro_González_y_Robleto', 'Vicente_Alejandro_González_y_Robleto']

    await getArticleIds(null, aIds)

    const { Alejandro_González_y_Robleto, Vicente_Alejandro_González_y_Robleto } = await RedisStore.articleDetailXId.getMany(aIds)

    // Article "Alejandro_González_y_Robleto" has been moved so it is not fetched
    expect(Alejandro_González_y_Robleto).toBeNull()

    // Article "Vicente_Alejandro_González_y_Robleto" is defined and has a title and a revisionId
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

describe('mwRetToArticleDetail — FlaggedRevs stableRevisionId extraction', () => {
  test('extracts stableRevisionId when flagged.stable_revid is present', () => {
    const mockQueryRet: QueryMwRet = {
      Berlin: {
        title: 'Berlin',
        ns: 0,
        contentmodel: 'wikitext',
        revisions: [{ revid: 200, parentid: 199, minor: '', user: 'TestUser', timestamp: '2024-01-01T00:00:00Z', comment: '' }],
        flagged: {
          stable_revid: 180,
          level: 0,
          level_text: 'stable',
        },
      } as any,
    }

    const result = mwRetToArticleDetail(mockQueryRet)

    expect(result.Berlin).toBeDefined()
    expect(result.Berlin.revisionId).toBe(200)
    expect(result.Berlin.stableRevisionId).toBe(180)
  })

  test('does not include stableRevisionId when flagged data is absent', () => {
    const mockQueryRet: QueryMwRet = {
      London: {
        title: 'London',
        ns: 0,
        contentmodel: 'wikitext',
        revisions: [{ revid: 100, parentid: 99, minor: '', user: 'SomeUser', timestamp: '2024-01-01T00:00:00Z', comment: '' }],
      } as any,
    }

    const result = mwRetToArticleDetail(mockQueryRet)

    expect(result.London).toBeDefined()
    expect(result.London.revisionId).toBe(100)
    expect(result.London.stableRevisionId).toBeUndefined()
  })

  test('does not include stableRevisionId when flagged exists but stable_revid is missing', () => {
    const mockQueryRet: QueryMwRet = {
      Paris: {
        title: 'Paris',
        ns: 0,
        contentmodel: 'wikitext',
        revisions: [{ revid: 300, parentid: 299, minor: '', user: 'Editor', timestamp: '2024-06-01T00:00:00Z', comment: '' }],
        flagged: {
          level: 1,
          level_text: 'quality',
        },
      } as any,
    }

    const result = mwRetToArticleDetail(mockQueryRet)

    expect(result.Paris).toBeDefined()
    expect(result.Paris.revisionId).toBe(300)
    expect(result.Paris.stableRevisionId).toBeUndefined()
  })

  test('handles mix of articles with and without FlaggedRevs data', () => {
    const mockQueryRet: QueryMwRet = {
      München: {
        title: 'München',
        ns: 0,
        contentmodel: 'wikitext',
        revisions: [{ revid: 500, parentid: 499, minor: '', user: 'DEUser', timestamp: '2024-03-01T00:00:00Z', comment: '' }],
        flagged: { stable_revid: 490 },
      } as any,
      Tokyo: {
        title: 'Tokyo',
        ns: 0,
        contentmodel: 'wikitext',
        revisions: [{ revid: 600, parentid: 599, minor: '', user: 'JPUser', timestamp: '2024-03-01T00:00:00Z', comment: '' }],
      } as any,
    }

    const result = mwRetToArticleDetail(mockQueryRet)

    expect(result['München'].stableRevisionId).toBe(490)
    expect(result['München'].revisionId).toBe(500)
    expect(result.Tokyo.stableRevisionId).toBeUndefined()
    expect(result.Tokyo.revisionId).toBe(600)
  })

  test('handles stableRevisionId equal to latest revisionId (both should be set)', () => {
    const mockQueryRet: QueryMwRet = {
      Hamburg: {
        title: 'Hamburg',
        ns: 0,
        contentmodel: 'wikitext',
        revisions: [{ revid: 400, parentid: 399, minor: '', user: 'User1', timestamp: '2024-02-01T00:00:00Z', comment: '' }],
        flagged: { stable_revid: 400 },
      } as any,
    }

    const result = mwRetToArticleDetail(mockQueryRet)

    expect(result.Hamburg.revisionId).toBe(400)
    expect(result.Hamburg.stableRevisionId).toBe(400)
  })
})
