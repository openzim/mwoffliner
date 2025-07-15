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
    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(true)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(true)
    expect(await MediaWiki.hasRestApi()).toBe(true)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(true)
    expect(await MediaWiki.checkIndexPhpPath()).toBe(true)
    expect(await MediaWiki.checkWikiPath()).toBe(true)
    expect(await MediaWiki.checkIndexPhpPath('Geography_of_Nairobi')).toBe(true) // check with a redirected article
    expect(await MediaWiki.checkWikiPath('Geography_of_Nairobi')).toBe(true) // check with a redirected article
  })

  test('test wrong paths on en.wikipedia.org', async () => {
    MediaWiki.base = 'https://en.wikipedia.org'
    MediaWiki.wikiPath = '/foo/'
    MediaWiki.indexPhpPath = '/foo.php'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }
    expect(await MediaWiki.checkIndexPhpPath()).toBe(false)
    expect(await MediaWiki.checkWikiPath()).toBe(false)
  })

  test('test capabilities of wiki.openstreetmap.org', async () => {
    MediaWiki.base = 'https://wiki.openstreetmap.org'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(false)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasRestApi()).toBe(true)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(true)
    expect(await MediaWiki.checkIndexPhpPath()).toBe(true)
    expect(await MediaWiki.checkWikiPath()).toBe(true)
    expect(await MediaWiki.checkIndexPhpPath('Pick_your_data_collection_technique')).toBe(true) // check with a redirected article
    expect(await MediaWiki.checkWikiPath('Pick_your_data_collection_technique')).toBe(true) // check with a redirected article
  })

  test('test capabilities of fo.wikisource.org', async () => {
    MediaWiki.base = 'https://fo.wikisource.org'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(true)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasRestApi()).toBe(true)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(true)
    expect(await MediaWiki.checkIndexPhpPath()).toBe(true)
    expect(await MediaWiki.checkWikiPath()).toBe(true)
  })

  test('test capabilities of minecraft.wiki with correct VisualEditor receipt', async () => {
    MediaWiki.base = 'https://minecraft.wiki'
    MediaWiki.wikiPath = '/w/'
    MediaWiki.actionApiPath = '/api.php'
    MediaWiki.indexPhpPath = '/index.php'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(false)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasRestApi()).toBe(false)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(true)
    expect(await MediaWiki.checkIndexPhpPath()).toBe(true)
    expect(await MediaWiki.checkWikiPath()).toBe(true)
    expect(await MediaWiki.checkIndexPhpPath('MCE')).toBe(true) // check with a redirected article
    expect(await MediaWiki.checkWikiPath('MCE')).toBe(true) // check with a redirected article
  })

  test('test capabilities of minecraft.wiki with incorrect path config', async () => {
    MediaWiki.base = 'https://minecraft.wiki'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }
    expect(await MediaWiki.checkIndexPhpPath()).toBe(false)
    expect(await MediaWiki.checkWikiPath()).toBe(true) // automatically redirect by minecraft.wiki
  })

  test('test capabilities of pokemon.fandom.com with correct VisualEditor receipt', async () => {
    MediaWiki.base = 'https://pokemon.fandom.com/'
    MediaWiki.actionApiPath = '/api.php'
    MediaWiki.indexPhpPath = '/index.php'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(false)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasRestApi()).toBe(false)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(true)
    expect(await MediaWiki.checkIndexPhpPath()).toBe(true)
    expect(await MediaWiki.checkWikiPath()).toBe(true)
    expect(await MediaWiki.checkIndexPhpPath('National_Dex')).toBe(true) // check with a redirected article
    expect(await MediaWiki.checkWikiPath('National_Dex')).toBe(true) // check with a redirected article
  })

  test('test capabilities of pokemon.fandom.com with default receipt', async () => {
    MediaWiki.base = 'https://pokemon.fandom.com/'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(false)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasRestApi()).toBe(false)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(false)
    expect(await MediaWiki.checkIndexPhpPath()).toBe(false)
    expect(await MediaWiki.checkWikiPath()).toBe(true)
  })

  test('test capabilities of pokemon.fandom.com with RestApi receipt', async () => {
    MediaWiki.base = 'https://pokemon.fandom.com/'
    MediaWiki.wikiPath = '/'
    MediaWiki.restApiPath = '/rest.php'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }

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
