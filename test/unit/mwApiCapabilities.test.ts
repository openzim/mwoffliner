import MediaWiki from '../../src/MediaWiki.js'

describe('Checking Mediawiki capabilities', () => {
  beforeEach(() => {
    MediaWiki.reset()
  })

  afterEach(() => {
    MediaWiki.reset()
  })

  test('test capabilities of en.wikipedia.org', async () => {
    MediaWiki.base = 'https://en.wikipedia.org'
    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(true)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(true)
    expect(await MediaWiki.hasMediawikiRestApi()).toBe(true)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(true)
  })

  test('test capabilities of wiki.openstreetmap.org', async () => {
    MediaWiki.base = 'https://wiki.openstreetmap.org'

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(false)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasMediawikiRestApi()).toBe(true)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(true)
  })

  test('test capabilities of fo.wikisource.org', async () => {
    MediaWiki.base = 'https://fo.wikisource.org'

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(true)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasMediawikiRestApi()).toBe(true)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(true)
  })

  test('test capabilities of minecraft.wiki with correct VisualEditor receipt', async () => {
    MediaWiki.base = 'https://minecraft.wiki'
    MediaWiki.wikiPath = '/'
    MediaWiki.actionApiPath = 'api.php'

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(false)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasMediawikiRestApi()).toBe(false)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(true)
  })

  test('test capabilities of pokemon.fandom.com with correct VisualEditor receipt', async () => {
    MediaWiki.base = 'https://pokemon.fandom.com/'
    MediaWiki.wikiPath = '/'
    MediaWiki.actionApiPath = 'api.php'

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(false)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasMediawikiRestApi()).toBe(false)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(true)
  })

  test('test capabilities of pokemon.fandom.com with default receipt', async () => {
    MediaWiki.base = 'https://pokemon.fandom.com/'

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(false)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasMediawikiRestApi()).toBe(false)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(false)
  })

  test('test capabilities of pokemon.fandom.com with MediawikiRestApi receipt', async () => {
    MediaWiki.base = 'https://pokemon.fandom.com/'
    MediaWiki.wikiPath = '/'
    MediaWiki.mediawikiRestApiPath = 'rest.php/v1/page/'

    expect(await MediaWiki.hasWikimediaDesktopApi()).toBe(false)
    expect(await MediaWiki.hasWikimediaMobileApi()).toBe(false)
    expect(await MediaWiki.hasVisualEditorApi()).toBe(false)

    /* TODO:
      Title MediaWiki:Sidebar does not exist for Mediawiki Rest Api in pokemon.fandom.com for some reason. This will lead to incorrect capability check
      See: https://pokemon.fandom.com/rest.php/v1/page/MediaWiki%3ASidebar/html
    */
    MediaWiki.apiCheckArticleId = 'Volcarona'
    expect(await MediaWiki.hasMediawikiRestApi()).toBe(true)
  })
})
