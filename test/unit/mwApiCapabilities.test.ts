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
    Downloader.options = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }
    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(true)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(true)
    expect(await MediaWiki.hasRestApi()).toBe(true)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(true)
  })

  test('test capabilities of wiki.openstreetmap.org', async () => {
    MediaWiki.base = 'https://wiki.openstreetmap.org'
    Downloader.options = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(false)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasRestApi()).toBe(true)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(true)
  })

  test('test capabilities of fo.wikisource.org', async () => {
    MediaWiki.base = 'https://fo.wikisource.org'
    Downloader.options = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(true)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasRestApi()).toBe(true)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(true)
  })

  test('test capabilities of minecraft.wiki with correct VisualEditor receipt', async () => {
    MediaWiki.base = 'https://minecraft.wiki'
    MediaWiki.wikiPath = '/'
    MediaWiki.actionApiPath = '/api.php'
    Downloader.options = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(false)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasRestApi()).toBe(false)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(true)
  })

  test('test capabilities of pokemon.fandom.com with correct VisualEditor receipt', async () => {
    MediaWiki.base = 'https://pokemon.fandom.com/'
    MediaWiki.wikiPath = '/'
    MediaWiki.actionApiPath = '/api.php'
    Downloader.options = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(false)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasRestApi()).toBe(false)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(true)
  })

  test('test capabilities of pokemon.fandom.com with default receipt', async () => {
    MediaWiki.base = 'https://pokemon.fandom.com/'
    Downloader.options = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(false)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasRestApi()).toBe(false)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(false)
  })

  test('test capabilities of pokemon.fandom.com with RestApi receipt', async () => {
    MediaWiki.base = 'https://pokemon.fandom.com/'
    MediaWiki.wikiPath = '/'
    MediaWiki.restApiPath = '/rest.php'
    Downloader.options = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(false)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(false)

    /* TODO:
      Title MediaWiki:Sidebar does not exist for Mediawiki Rest Api in pokemon.fandom.com for some reason. This will lead to incorrect capability check
      See: https://pokemon.fandom.com/rest.php/v1/page/MediaWiki%3ASidebar/html
    */
    MediaWiki.apiCheckArticleId = 'Volcarona'
    expect(await MediaWiki.hasRestApi()).toBe(true)
  })
})
