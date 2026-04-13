import { startRedis, stopRedis } from '../bootstrap.js'
import Downloader from '../../../src/Downloader.js'
import MediaWiki from '../../../src/MediaWiki.js'
import { config } from '../../../src/config.js'
import { downloadModule, processStylesheetContent } from '../../../src/util/dump.js'
import RedisStore from '../../../src/RedisStore.js'
import urlHelper from '../../../src/util/url.helper.js'
import { jest } from '@jest/globals'
import FileManager from '../../../src/util/FileManager.js'

describe('Download CSS or JS Module', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  beforeEach(async () => {
    const { filesToDownloadXPath } = RedisStore
    await filesToDownloadXPath.flush()
    FileManager.reset()
    MediaWiki.base = 'https://en.wikipedia.org'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }
  })

  test('download skins.vector.styles CSS', async () => {
    const { text: content, moduleApiUrl } = await downloadModule('skins.vector.styles', 'css')

    // URL expected to be used to retrieve CSS module
    expect(moduleApiUrl).toBe('https://en.wikipedia.org/w/load.php?lang=en&modules=skins.vector.styles&only=styles&skin=vector')

    // Check if CSS module still contain this background image
    expect(content).toContain(`background-image:url(../_assets_/4bcf8483172f7467f47867020b95783b/link-external-small-ltr-progressive.svg`)

    // One SVG (among others) expected to be tracked in filesToDownloadXPath
    const keys = await RedisStore.filesToDownloadXPath.keys()
    expect(keys).toContain('_assets_/4bcf8483172f7467f47867020b95783b/link-external-small-ltr-progressive.svg')
  })

  test('rewrite standalone CSS', async () => {
    const rewrittenCSS = await processStylesheetContent(
      'https://en.wikipedia.org/w/load.php?lang=en&modules=skins.vector.styles&only=styles&skin=vector',
      '',
      'a.external { background-image: url(/w/skins/Vector/resources/skins.vector.styles/images/link-external-small-ltr-progressive.svg?fb64d); }',
      '',
    )
    expect(rewrittenCSS).toContain('a.external { background-image: url(../_assets_/4bcf8483172f7467f47867020b95783b/link-external-small-ltr-progressive.svg); }')
    expect(await RedisStore.filesToDownloadXPath.keys()).toStrictEqual(['_assets_/4bcf8483172f7467f47867020b95783b/link-external-small-ltr-progressive.svg'])
    const redisValue = await RedisStore.filesToDownloadXPath.get('_assets_/4bcf8483172f7467f47867020b95783b/link-external-small-ltr-progressive.svg')
    expect(urlHelper.deserializeUrl(redisValue.url)).toBe(
      'https://en.wikipedia.org/w/skins/Vector/resources/skins.vector.styles/images/link-external-small-ltr-progressive.svg?fb64d',
    )
  })

  test('rewrite inline CSS with relative path', async () => {
    const rewrittenCSS = await processStylesheetContent(
      'https://en.wikipedia.org/w/load.php?lang=en&modules=skins.vector.styles&only=styles&skin=vector',
      '',
      'a.external { background-image: url(/w/skins/Vector/resources/skins.vector.styles/images/link-external-small-ltr-progressive.svg?fb64d); }',
      'article/with/slashes',
    )
    expect(rewrittenCSS).toContain('a.external { background-image: url(../../_assets_/4bcf8483172f7467f47867020b95783b/link-external-small-ltr-progressive.svg); }')
    expect(await RedisStore.filesToDownloadXPath.keys()).toStrictEqual(['_assets_/4bcf8483172f7467f47867020b95783b/link-external-small-ltr-progressive.svg'])
    const redisValue = await RedisStore.filesToDownloadXPath.get('_assets_/4bcf8483172f7467f47867020b95783b/link-external-small-ltr-progressive.svg')
    expect(urlHelper.deserializeUrl(redisValue.url)).toBe(
      'https://en.wikipedia.org/w/skins/Vector/resources/skins.vector.styles/images/link-external-small-ltr-progressive.svg?fb64d',
    )
  })

  test('rewrite inline CSS with absolute path', async () => {
    const rewrittenCSS = await processStylesheetContent(
      'https://en.wikipedia.org/w/load.php?lang=en&modules=skins.vector.styles&only=styles&skin=vector',
      '',
      'a.external { background-image: url(//upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Commons-logo.svg/64px-Commons-logo.svg.png); }',
      'articleTitle',
    )
    expect(rewrittenCSS).toContain('a.external { background-image: url(./_assets_/0c70a452f799bfe840676ee341124611/Commons-logo.svg.png); }')
    expect(await RedisStore.filesToDownloadXPath.keys()).toStrictEqual(['_assets_/0c70a452f799bfe840676ee341124611/Commons-logo.svg.png'])
    const redisValue = await RedisStore.filesToDownloadXPath.get('_assets_/0c70a452f799bfe840676ee341124611/Commons-logo.svg.png')
    expect(urlHelper.deserializeUrl(redisValue.url)).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Commons-logo.svg/64px-Commons-logo.svg.png')
  })

  test('rewrite CSS with encoded image', async () => {
    const rewrittenCSS = await processStylesheetContent(
      'https://minecraft.wiki/load.php?lang=en&modules=ext.gadget.site-styles&only=styles&skin=vector',
      '',
      '.mcui-arrow { background: url(/images/Grid_layout_Arrow_%28small%29.png?a4894) no-repeat; }',
      '',
    )
    expect(rewrittenCSS).toContain('.mcui-arrow { background: url(../_assets_/5af80496508534f4cdd561aac15bbc50/Grid_layout_Arrow_%28small%29.png) no-repeat; }')
    expect(await RedisStore.filesToDownloadXPath.keys()).toStrictEqual(['_assets_/5af80496508534f4cdd561aac15bbc50/Grid_layout_Arrow_(small).png'])
    const redisValue = await RedisStore.filesToDownloadXPath.get('_assets_/5af80496508534f4cdd561aac15bbc50/Grid_layout_Arrow_(small).png')
    expect(urlHelper.deserializeUrl(redisValue.url)).toBe('https://minecraft.wiki/images/Grid_layout_Arrow_%28small%29.png?a4894')
  })

  test('resolve single @import statement', async () => {
    const downloadSpy = jest.spyOn(Downloader, 'downloadContent').mockImplementation(async (url: string) => {
      if (url === 'https://example.wiki/customizations/custom.css') {
        return { content: Buffer.from('.imported { color: red; }'), contentType: 'text/css', setCookie: null }
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const rewrittenCSS = await processStylesheetContent(
      'https://example.wiki/load.php?modules=site.styles',
      '',
      '@import url("/customizations/custom.css");\n.main { color: blue; }',
      '',
    )

    expect(rewrittenCSS).toContain('.main { color: blue; }')
    expect(rewrittenCSS).toContain('.imported { color: red; }')
    expect(rewrittenCSS).not.toContain('@import')
    expect(downloadSpy).toHaveBeenCalledWith('https://example.wiki/customizations/custom.css', 'css')

    downloadSpy.mockRestore()
  })

  test('resolve nested @import statements', async () => {
    const downloadSpy = jest.spyOn(Downloader, 'downloadContent').mockImplementation(async (url: string) => {
      if (url === 'https://example.wiki/css/a.css') {
        return { content: Buffer.from('@import url("/css/b.css");\n.from-a { color: red; }'), contentType: 'text/css', setCookie: null }
      }
      if (url === 'https://example.wiki/css/b.css') {
        return { content: Buffer.from('.from-b { color: green; }'), contentType: 'text/css', setCookie: null }
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const rewrittenCSS = await processStylesheetContent('https://example.wiki/load.php?modules=site.styles', '', '@import url("/css/a.css");\n.main { color: blue; }', '')

    expect(rewrittenCSS).toContain('.main { color: blue; }')
    expect(rewrittenCSS).toContain('.from-a { color: red; }')
    expect(rewrittenCSS).toContain('.from-b { color: green; }')
    expect(rewrittenCSS).not.toContain('@import')
    expect(rewrittenCSS.indexOf('.from-b { color: green; }')).toBeLessThan(rewrittenCSS.indexOf('.from-a { color: red; }'))
    expect(rewrittenCSS.indexOf('.from-a { color: red; }')).toBeLessThan(rewrittenCSS.indexOf('.main { color: blue; }'))

    downloadSpy.mockRestore()
  })

  test('handle circular @import without infinite loop', async () => {
    const downloadSpy = jest.spyOn(Downloader, 'downloadContent').mockImplementation(async (url: string) => {
      if (url === 'https://example.wiki/css/a.css') {
        return { content: Buffer.from('@import url("/css/b.css");\n.from-a { color: red; }'), contentType: 'text/css', setCookie: null }
      }
      if (url === 'https://example.wiki/css/b.css') {
        return { content: Buffer.from('@import url("/css/a.css");\n.from-b { color: green; }'), contentType: 'text/css', setCookie: null }
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const rewrittenCSS = await processStylesheetContent('https://example.wiki/load.php?modules=site.styles', '', '@import url("/css/a.css");\n.main { color: blue; }', '')

    expect(rewrittenCSS).toContain('.main { color: blue; }')
    expect(rewrittenCSS).toContain('.from-a { color: red; }')
    expect(rewrittenCSS).toContain('.from-b { color: green; }')
    expect(rewrittenCSS).not.toContain('@import')

    downloadSpy.mockRestore()
  })

  test('resolve @import with quoted string syntax', async () => {
    const downloadSpy = jest.spyOn(Downloader, 'downloadContent').mockImplementation(async (url: string) => {
      if (url === 'https://example.wiki/css/quoted.css') {
        return { content: Buffer.from('.quoted { font-weight: bold; }'), contentType: 'text/css', setCookie: null }
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const rewrittenCSS = await processStylesheetContent('https://example.wiki/load.php?modules=site.styles', '', '@import "/css/quoted.css";\n.main { color: blue; }', '')

    expect(rewrittenCSS).toContain('.quoted { font-weight: bold; }')
    expect(rewrittenCSS).toContain('.main { color: blue; }')
    expect(rewrittenCSS).not.toContain('@import')

    downloadSpy.mockRestore()
  })

  test('convert @import supports and media queries to wrappers', async () => {
    const downloadSpy = jest.spyOn(Downloader, 'downloadContent').mockImplementation(async (url: string) => {
      if (url === 'https://example.wiki/css/feature.css') {
        return { content: Buffer.from('.feature { color: red; }'), contentType: 'text/css', setCookie: null }
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const rewrittenCSS = await processStylesheetContent(
      'https://example.wiki/load.php?modules=site.styles',
      '',
      '@import url("/css/feature.css") supports(display: grid) screen and (min-width: 800px);\n.main { color: blue; }',
      '',
    )

    expect(rewrittenCSS).not.toContain('@import')
    expect(rewrittenCSS).toContain('@supports (display: grid)')
    expect(rewrittenCSS).toContain('@media screen and (min-width: 800px)')
    expect(rewrittenCSS).toContain('.feature { color: red; }')

    downloadSpy.mockRestore()
  })

  test('rewrite url() in imported CSS relative to import URL', async () => {
    const downloadSpy = jest.spyOn(Downloader, 'downloadContent').mockImplementation(async (url: string) => {
      if (url === 'https://example.wiki/css/imported.css') {
        return { content: Buffer.from('.bg { background: url(images/icon.png); }'), contentType: 'text/css', setCookie: null }
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const rewrittenCSS = await processStylesheetContent('https://example.wiki/load.php?modules=site.styles', '', '@import url("/css/imported.css");', '')

    // The url(images/icon.png) in imported.css should be resolved relative to
    // https://example.wiki/css/imported.css, giving https://example.wiki/css/images/icon.png
    expect(rewrittenCSS).toContain('_assets_/')
    const keys = await RedisStore.filesToDownloadXPath.keys()
    expect(keys.some((k) => k.includes('icon.png'))).toBe(true)

    downloadSpy.mockRestore()
  })
})
