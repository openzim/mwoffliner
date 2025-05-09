import { startRedis, stopRedis } from './bootstrap.js'
import { jest } from '@jest/globals'
import { WikimediaDesktopRenderer } from '../../src/renderers/wikimedia-desktop.renderer.js'
import { WikimediaMobileRenderer } from '../../src/renderers/wikimedia-mobile.renderer.js'

jest.setTimeout(10000)

describe('saveStaticFiles', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  test('Compare desktop static files list', async () => {
    const desktopAndCommonStaticFiles = [
      'script.js',
      'masonry.min.js',
      'article_list_home.js',
      'images_loaded.min.js',
      'style.css',
      'mobile_main_page.css',
      'footer.css',
      '../node_modules/details-element-polyfill/dist/details-element-polyfill.js',
      'content.parsoid.css',
      'inserted_style.css',
    ]

    const wikimediaDesktopRenderer = new WikimediaDesktopRenderer()
    const staticFilesFromRenderer = wikimediaDesktopRenderer.staticFilesListDesktop

    expect(desktopAndCommonStaticFiles).toEqual(staticFilesFromRenderer)
  })

  test('Compare mobile static files list', async () => {
    const mobileAndCommonStatiFiles = [
      'script.js',
      'masonry.min.js',
      'article_list_home.js',
      'images_loaded.min.js',
      'style.css',
      'mobile_main_page.css',
      'footer.css',
      'wm_mobile_override_script.js',
      'wm_mobile_override_style.css',
    ]

    const wikimediaMobileRenderer = new WikimediaMobileRenderer()
    const staticFilesFromRenderer = wikimediaMobileRenderer.staticFilesListMobile

    expect(mobileAndCommonStatiFiles).toEqual(staticFilesFromRenderer)
  })
})
