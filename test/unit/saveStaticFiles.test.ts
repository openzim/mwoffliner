import { startRedis, stopRedis } from './bootstrap.js'
import { jest } from '@jest/globals'
import { ActionParseRenderer } from '../../src/renderers/action-parse.renderer.js'
import MediaWiki from '../../src/MediaWiki.js'

jest.setTimeout(10000)

describe('saveStaticFiles', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  beforeEach(() => {
    MediaWiki.reset()
  })

  afterEach(() => {
    MediaWiki.reset()
  })

  for (const skin of ['vector', 'vector-2022', 'fandomdesktop']) {
    test(`Compare ${skin} skin static files list`, async () => {
      MediaWiki.skin = skin
      const desktopAndCommonStaticFiles = [
        'script.js',
        'masonry.min.js',
        'article_list_home.js',
        'images_loaded.min.js',
        'style.css',
        'mobile_main_page.css',
        'footer.css',
        ...(skin === 'vector' ? ['vector.css'] : []),
        ...(skin === 'vector-2022' ? ['vector-2022.css'] : []),
        'external-link.svg',
      ]

      const actionParseRenderer = new ActionParseRenderer()
      const staticFilesFromRenderer = actionParseRenderer.staticFilesList

      expect(desktopAndCommonStaticFiles).toEqual(staticFilesFromRenderer)
    })
  }
})
