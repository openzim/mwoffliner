import { startRedis, stopRedis, redisStore } from './bootstrap.js'
import Downloader from '../../src/Downloader.js'
import MediaWiki from '../../src/MediaWiki.js'
import { getArticleIds } from '../../src/util/redirects.js'
import { getArticlesByNS } from '../../src/util/index.js'
import { config } from '../../src/config.js'
import { jest } from '@jest/globals'

jest.setTimeout(10000)

describe('mwApi', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  let downloader: Downloader

  beforeEach(async () => {
    await redisStore.articleDetailXId.flush()

    MediaWiki.base = 'https://en.wikipedia.org'
    MediaWiki.getCategories = true

    downloader = new Downloader({ uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: false, optimisationCacheUrl: '' })

    await MediaWiki.getMwMetaData(downloader)
    await MediaWiki.hasWikimediaDesktopRestApi()
    await MediaWiki.hasVisualEditorApi()
    await downloader.checkCoordinatesAvailability()

    await MediaWiki.getNamespaces([], downloader)
  })

  test('MWApi Article Ids', async () => {
    const aIds = ['London', 'United_Kingdom', 'Farnborough/Aldershot_built-up_area']

    await getArticleIds(downloader, redisStore, 'Main_Page', aIds)

    const articlesById = await redisStore.articleDetailXId.getMany(aIds)
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
    await getArticlesByNS(0, downloader, redisStore, undefined, 5) // Get 5 continues/pages of NSes
    const interestingAIds = ['"...And_Ladies_of_the_Club"', '"M"_Circle']
    const articles = await redisStore.articleDetailXId.getMany(interestingAIds)
    const Ladies = articles['"...And_Ladies_of_the_Club"']
    const Circle = articles['"M"_Circle']

    // Article ""...And_Ladies_of_the_Club"" has been scraped
    expect(Ladies).toBeDefined()

    // Article ""M"_Circle" has been scraped
    expect(Circle).toBeDefined()

    // Ladies article has categories
    expect(Ladies?.categories?.length).toBeGreaterThan(0)

    // Ladies article has revision
    expect(Ladies).toHaveProperty('revisionId')

    // Circle article has coordinates'
    expect(Circle).toHaveProperty('coordinates')

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
  })
})
