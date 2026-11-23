import Downloader from '../../src/Downloader.js'
import MediaWiki from '../../src/MediaWiki.js'
import { jest } from '@jest/globals'
import { config } from '../../src/config.js'

jest.setTimeout(30000)

describe('Checking Mediawiki capabilities', () => {
  let requestSpy: ReturnType<typeof jest.spyOn>

  const initDownloader = () => {
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, workers: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }
  }

  const expectRequested = (urlPart: string) => {
    expect(requestSpy).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining(urlPart) }))
  }

  beforeEach(() => {
    MediaWiki.reset()
    requestSpy = jest.spyOn(Downloader, 'request').mockResolvedValue({ status: 200, headers: {}, data: '' } as any)
  })

  afterEach(() => {
    MediaWiki.reset()
    jest.restoreAllMocks()
  })

  test('test capabilities of en.wikipedia.org', async () => {
    MediaWiki.base = 'https://en.wikipedia.org'
    initDownloader()
    expect(await MediaWiki.hasActionParseApi()).toBe(true)
    expect(await MediaWiki.hasModuleApi()).toBe(true)
    expectRequested('https://en.wikipedia.org/w/api.php?action=parse')
    expectRequested('https://en.wikipedia.org/w/load.php')
  })

  test('test capabilities of wiki.openstreetmap.org', async () => {
    MediaWiki.base = 'https://wiki.openstreetmap.org'
    initDownloader()
    expect(await MediaWiki.hasActionParseApi()).toBe(true)
    expect(await MediaWiki.hasModuleApi()).toBe(true)
    expectRequested('https://wiki.openstreetmap.org/w/api.php?action=parse')
    expectRequested('https://wiki.openstreetmap.org/w/load.php')
  })

  test('test capabilities of fo.wikisource.org', async () => {
    MediaWiki.base = 'https://fo.wikisource.org'
    initDownloader()
    expect(await MediaWiki.hasActionParseApi()).toBe(true)
    expect(await MediaWiki.hasModuleApi()).toBe(true)
    expectRequested('https://fo.wikisource.org/w/api.php?action=parse')
    expectRequested('https://fo.wikisource.org/w/load.php')
  })

  test('test capabilities of minecraft.wiki', async () => {
    MediaWiki.base = 'https://minecraft.wiki'
    MediaWiki.actionApiPath = '/api.php'
    MediaWiki.modulePathOpt = '/load.php'
    initDownloader()
    expect(await MediaWiki.hasActionParseApi()).toBe(true)
    expect(await MediaWiki.hasModuleApi()).toBe(true)
    expectRequested('https://minecraft.wiki/api.php?action=parse')
    expectRequested('https://minecraft.wiki/load.php')
  })

  test('test capabilities of pokemon.fandom.com', async () => {
    MediaWiki.base = 'https://pokemon.fandom.com'
    MediaWiki.actionApiPath = '/api.php'
    MediaWiki.modulePathOpt = '/load.php'
    MediaWiki.apiCheckPageTitle = 'Volcarona' as PageTitle
    MediaWiki.skin = 'fandomdesktop'
    initDownloader()
    expect(await MediaWiki.hasActionParseApi()).toBe(true)
    expect(await MediaWiki.hasModuleApi()).toBe(true)
    expectRequested('https://pokemon.fandom.com/api.php?action=parse')
    expectRequested('https://pokemon.fandom.com/load.php')
  })
})
