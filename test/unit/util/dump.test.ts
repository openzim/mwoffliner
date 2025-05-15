import { startRedis, stopRedis } from '../bootstrap.js'
import Downloader from '../../../src/Downloader.js'
import MediaWiki from '../../../src/MediaWiki.js'
import { config } from '../../../src/config.js'
import { downloadModule, processStylesheetContent } from '../../../src/util/dump.js'
import RedisStore from '../../../src/RedisStore.js'
import urlHelper from '../../../src/util/url.helper.js'

describe('Download CSS or JS Module', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  beforeEach(() => {
    const { filesToDownloadXPath } = RedisStore
    filesToDownloadXPath.flush()
    MediaWiki.base = 'https://en.wikipedia.org'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }
  })

  test('download skins.vector.styles CSS', async () => {
    const { text: content, moduleApiUrl } = await downloadModule('skins.vector.styles', 'css')

    // URL expected to be used to retrieve CSS module
    expect(moduleApiUrl).toBe('https://en.wikipedia.org/w/load.php?debug=true&lang=en&modules=skins.vector.styles&only=styles&skin=vector&version=&*')

    // Check if CSS module still contain this background image
    expect(content).toContain(`background-image: url(link.ernal-small-ltr-progressive.svg`)

    // One SVG (among others) expected to be used inside the CSS
    expect(Object.keys(Downloader.cssDependenceUrls)).toContain(
      'https://en.wikipedia.org/w/skins/Vector/resources/skins.vector.styles/images/link-external-small-ltr-progressive.svg?fb64d',
    )
  })

  test('rewrite CSS', async () => {
    const rewrittenCSS = processStylesheetContent(
      'https://en.wikipedia.org/w/load.php?debug=true&lang=en&modules=skins.vector.styles&only=styles&skin=vector&version=&*',
      '',
      'a.external { background-image: url(/w/skins/Vector/resources/skins.vector.styles/images/link-external-small-ltr-progressive.svg?fb64d)); }',
    )
    expect(rewrittenCSS).toContain('a.external { background-image: url(link.ernal-small-ltr-progressive.svg)); }')
    expect(await RedisStore.filesToDownloadXPath.keys()).toStrictEqual(['mw/link.ernal-small-ltr-progressive.svg'])
    const redisValue = await RedisStore.filesToDownloadXPath.get('mw/link.ernal-small-ltr-progressive.svg')
    expect(urlHelper.deserializeUrl(redisValue.url)).toBe(
      'https://en.wikipedia.org/w/skins/Vector/resources/skins.vector.styles/images/link-external-small-ltr-progressive.svg?fb64d',
    )
  })
})
