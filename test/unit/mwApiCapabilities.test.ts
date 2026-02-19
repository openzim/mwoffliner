import Downloader from '../../src/Downloader.js'
import MediaWiki from '../../src/MediaWiki.js'
import { jest } from '@jest/globals'
import { config } from '../../src/config.js'

jest.setTimeout(30000)

describe('Checking Mediawiki capabilities', () => {
  beforeEach(() => {
    MediaWiki.reset()
  })

  afterEach(() => {
    MediaWiki.reset()
  })

  test('test capabilities of en.wikipedia.org', async () => {
    MediaWiki.base = 'https://en.wikipedia.org'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }
    expect(await MediaWiki.hasActionParseApi()).toBe(true)
    expect(await MediaWiki.hasModuleApi()).toBe(true)
  })

  test('test capabilities of wiki.openstreetmap.org', async () => {
    MediaWiki.base = 'https://wiki.openstreetmap.org'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }
    expect(await MediaWiki.hasActionParseApi()).toBe(true)
    expect(await MediaWiki.hasModuleApi()).toBe(true)
  })

  test('test capabilities of fo.wikisource.org', async () => {
    MediaWiki.base = 'https://fo.wikisource.org'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }
    expect(await MediaWiki.hasActionParseApi()).toBe(true)
    expect(await MediaWiki.hasModuleApi()).toBe(true)
  })

  test('test capabilities of minecraft.wiki', async () => {
    MediaWiki.base = 'https://minecraft.wiki'
    MediaWiki.actionApiPath = '/api.php'
    MediaWiki.modulePathOpt = '/load.php'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }
    expect(await MediaWiki.hasActionParseApi()).toBe(true)
    expect(await MediaWiki.hasModuleApi()).toBe(true)
  })

  test('test capabilities of pokemon.fandom.com', async () => {
    MediaWiki.base = 'https://pokemon.fandom.com'
    MediaWiki.actionApiPath = '/api.php'
    MediaWiki.modulePathOpt = '/load.php'
    MediaWiki.apiCheckArticleId = 'Volcarona' // MediaWiki:Sidebar does not exist in pokemon.fandom.com
    MediaWiki.skin = 'fandomdesktop' // vector skin does not exist in pokemon.fandom.com
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }
    expect(await MediaWiki.hasActionParseApi()).toBe(true)
    expect(await MediaWiki.hasModuleApi()).toBe(true)
  })
})
