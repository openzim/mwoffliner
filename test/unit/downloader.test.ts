import { startRedis, stopRedis } from './bootstrap.js'
import Downloader from '../../src/Downloader.js'
import MediaWiki from '../../src/MediaWiki.js'
import RedisStore from '../../src/RedisStore.js'
import Axios from 'axios'
import { mwRetToArticleDetail, stripHttpFromUrl } from '../../src/util/index.js'
import S3 from '../../src/S3.js'
import { Dump } from '../../src/Dump.js'
import { config } from '../../src/config.js'
import 'dotenv/config.js'
import * as FileType from 'file-type'
import { jest } from '@jest/globals'
import urlParser from 'url'
import { setTimeout } from 'timers/promises'
import domino from 'domino'
import { WikimediaDesktopRenderer } from '../../src/renderers/wikimedia-desktop.renderer.js'
import { WikimediaMobileRenderer } from '../../src/renderers/wikimedia-mobile.renderer.js'
import { VisualEditorRenderer } from '../../src/renderers/visual-editor.renderer.js'
import { RestApiRenderer } from '../../src/renderers/rest-api.renderer.js'
import { RENDERERS_LIST } from '../../src/util/const.js'

jest.setTimeout(200000)

describe('Downloader class', () => {
  let downloader: Downloader

  beforeAll(startRedis)
  afterAll(stopRedis)

  beforeAll(async () => {
    MediaWiki.base = 'https://en.wikipedia.org'
    MediaWiki.getCategories = true
    downloader = new Downloader({ uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' })

    await MediaWiki.getMwMetaData(downloader)
    await MediaWiki.hasCoordinates(downloader)
    await MediaWiki.hasWikimediaDesktopApi(downloader)
    await MediaWiki.hasWikimediaMobileApi(downloader)
    await MediaWiki.hasRestApi(downloader)
    await MediaWiki.hasVisualEditorApi(downloader)
  })

  test('Test Action API version 2 response in comparison with version 1', async () => {
    const actionAPIResV1 = await downloader.getJSON('https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=modules|jsconfigvars|headhtml&page=Potato')
    const actionAPIResV2 = await downloader.getJSON('https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=modules|jsconfigvars|headhtml&formatversion=2&page=Potato')
    expect(actionAPIResV1).not.toEqual(actionAPIResV2)
  })

  test('downloader.query returns valid JSON', async () => {
    const queryRet = await downloader.query()
    expect(typeof queryRet).toBe('object')
  })

  test('downloader.getJSON returns valid JSON', async () => {
    const JSONRes = await downloader.getJSON('https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json')
    expect(typeof JSONRes).toBe('object')
  })

  test('downloader.canGetUrl returns valid answer (positive)', async () => {
    const urlExists = await downloader.canGetUrl('https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json')
    expect(urlExists).toBe(true)
  })

  test('downloader.canGetUrl returns valid answer (negative)', async () => {
    const urlNotExists = await downloader.canGetUrl('https://en.wikipedia.org/w/thisisa404')
    expect(urlNotExists).toBe(false)
  })

  test('getJSON response status for non-existant url is 404', async () => {
    await expect(downloader.getJSON('https://en.wikipedia.org/w/thisisa404')).rejects.toThrowError(new Error('Request failed with status code 404'))
  })

  test('downloader.downloadContent returns', async () => {
    const contentRes = await downloader.downloadContent('https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/London_Montage_L.jpg/275px-London_Montage_L.jpg', 'image')
    expect(contentRes.contentType).toBeDefined()
  })

  test('Webp compression working for cmyk color-space images', async () => {
    const { content } = await downloader.downloadContent('https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/LOGO_HAEMMERLIN.jpg/550px-LOGO_HAEMMERLIN.jpg', 'image')
    const fileType = await FileType.fileTypeFromBuffer(Buffer.from(content))
    expect(fileType?.mime).toEqual('image/webp')
  })

  test('downloader.downloadContent throws on non-existant url', async () => {
    await expect(downloader.downloadContent('https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/thisdoesnotexist.jpg', 'image')).rejects.toThrowError(
      new Error('Request failed with status code 404'),
    )
  })

  test("getArticleDetailsIds Scraped 'London', 'United_Kingdom', 'Paris', 'Zürich', 'THISARTICLEDOESNTEXIST' successfully", async () => {
    const _articleDetailsRet = await downloader.getArticleDetailsIds(['London', 'United_Kingdom', 'Paris', 'Zurich', 'THISARTICLEDOESNTEXIST', 'Category:Container_categories'])
    const articleDetailsRet = mwRetToArticleDetail(_articleDetailsRet)
    RedisStore.articleDetailXId.setMany(articleDetailsRet)
    const { London, Paris, Zurich, United_Kingdom, THISARTICLEDOESNTEXIST } = articleDetailsRet
    expect(London).toBeDefined()
    expect(United_Kingdom).toBeDefined()
    expect(Paris).toBeDefined()
    expect(Zurich).toBeDefined()

    expect(THISARTICLEDOESNTEXIST.missing).toBe(true)
  })

  test("getArticleDetailsNS query returns 'gapContinue' or 'multiple articles', ", async () => {
    const { gapContinue, articleDetails } = await downloader.getArticleDetailsNS(0)
    expect(gapContinue).toBeDefined()
    expect(Object.keys(articleDetails).length).toBeGreaterThan(10)

    const secondNsRet = await downloader.getArticleDetailsNS(0, gapContinue)
    expect(secondNsRet.gapContinue).toBeDefined()
  })

  test('downloadContent throws when empty string is passed', async () => {
    await expect(downloader.downloadContent('', 'image')).rejects.toThrowError()
  })

  test('downloadContent successfully downloaded an image', async () => {
    const { data: LondonHtml } = await Axios.get('https://en.wikipedia.org/api/rest_v1/page/html/London')
    const doc = domino.createDocument(LondonHtml)
    const imgToGet = Array.from(doc.querySelectorAll('[data-mw-section-id="0"] img'))[0]
    let imgToGetSrc = ''
    if (imgToGet.getAttribute('src')) {
      imgToGetSrc = imgToGet.getAttribute('src')
    }
    // This is the downloading of an image
    const LondonImage = await downloader.downloadContent(imgToGetSrc, 'image')
    expect(LondonImage.contentType).toMatch(/image\//i)
  })

  test('downloadContent successfully downloads a map image', async () => {
    const { data: LondonHtml } = await Axios.get('https://en.wikipedia.org/api/rest_v1/page/html/London')
    const doc = domino.createDocument(LondonHtml)
    const imgToGet = Array.from(doc.querySelectorAll('.mw-kartographer-map img'))[0]
    let imgToGetSrc = ''
    if (imgToGet.getAttribute('src')) {
      imgToGetSrc = imgToGet.getAttribute('src')
    }
    // This is the downloading of an image
    const LondonImage = await downloader.downloadContent(imgToGetSrc, 'image')
    expect(LondonImage.contentType).toMatch(/image\//i)
  })

  describe('getArticle method', () => {
    let dump: Dump
    const wikimediaMobileRenderer = new WikimediaMobileRenderer()

    beforeAll(async () => {
      const mwMetadata = await MediaWiki.getMwMetaData(downloader)
      dump = new Dump('', {} as any, mwMetadata)
    })

    test('getArticle of "London" returns one article for WikimediaMobileRenderer render', async () => {
      const articleId = 'London'
      downloader.setUrlsDirectors(wikimediaMobileRenderer, wikimediaMobileRenderer)
      const articleUrl = downloader.getArticleUrl(articleId)
      const articleDetail = {
        title: articleId,
        thumbnail: {
          width: 50,
          height: 28,
          source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/50px-London_Skyline_%28125508655%29.jpeg',
        },
        revisionId: 1171340841,
        timestamp: '2023-08-20T14:54:01Z',
        coordinates: '51.50722222;-0.1275',
      }
      const _moduleDependencies = await downloader.getModuleDependencies(articleDetail.title)
      const LondonArticle = await downloader.getArticle(
        downloader.webp,
        _moduleDependencies,
        articleId,
        RedisStore.articleDetailXId,
        wikimediaMobileRenderer,
        articleUrl,
        dump,
        articleDetail,
        dump.isMainPage(articleId),
      )
      expect(LondonArticle).toHaveLength(1)
    })

    test('Categories with many subCategories are paginated for WikimediaDesktop render', async () => {
      const articleId = 'Category:Container_categories'
      const _moduleDependencies = await downloader.getModuleDependencies(articleId)
      const wikimediaDesktopRenderer = new WikimediaDesktopRenderer()
      const articleDetail = {
        title: articleId,
        ns: 14,
        revisionId: 1168361498,
        timestamp: '2023-08-02T09:57:11Z',
      }
      // Enforce desktop url here as this test desktop API-specific
      const articleUrl = `https://en.wikipedia.org/api/rest_v1/page/html/${articleId}`
      const PaginatedArticle = await downloader.getArticle(
        downloader.webp,
        _moduleDependencies,
        articleId,
        RedisStore.articleDetailXId,
        wikimediaDesktopRenderer,
        articleUrl,
        dump,
        articleDetail,
        dump.isMainPage(articleId),
      )
      expect(PaginatedArticle.length).toBeGreaterThan(100)
    })

    test('getArticle response status for non-existent article id is 404 for WikimediaDesktop render', async () => {
      const articleId = 'NeverExistingArticle'
      const articleUrl = downloader.getArticleUrl(articleId)
      const articleDetail = {
        title: articleId,
        missing: '',
      }
      const _moduleDependencies = await downloader.getModuleDependencies(articleDetail.title)
      await expect(
        downloader.getArticle(
          downloader.webp,
          _moduleDependencies,
          'NeverExistingArticle',
          RedisStore.articleDetailXId,
          wikimediaMobileRenderer,
          articleUrl,
          dump,
          articleDetail,
          dump.isMainPage(articleId),
        ),
      ).rejects.toThrowError(new Error('Request failed with status code 404'))
    })
  })

  describe('getArticle method', () => {
    for (const renderer of RENDERERS_LIST) {
      let rendererInstance
      switch (renderer) {
        case 'VisualEditor':
          rendererInstance = new VisualEditorRenderer()
          break
        case 'WikimediaDesktop':
          rendererInstance = new WikimediaDesktopRenderer()
          break
        case 'WikimediaMobile':
          rendererInstance = new WikimediaMobileRenderer()
          break
        case 'RestApi':
          rendererInstance = new RestApiRenderer()
          break
        default:
          throw new Error(`Unknown renderer: ${renderer}`)
      }
      let dump: Dump
      beforeAll(async () => {
        const mwMetadata = await MediaWiki.getMwMetaData(downloader)
        dump = new Dump('', {} as any, mwMetadata)
      })

      test(`getArticle response status for non-existent article id is 404 for ${renderer} render`, async () => {
        const articleId = 'NeverExistingArticle'
        const articleUrl = downloader.getArticleUrl(articleId)
        const articleDetail = {
          title: articleId,
          missing: '',
        }
        const _moduleDependencies = await downloader.getModuleDependencies(articleDetail.title)
        await expect(
          downloader.getArticle(
            downloader.webp,
            _moduleDependencies,
            'NeverExistingArticle',
            RedisStore.articleDetailXId,
            rendererInstance,
            articleUrl,
            dump,
            articleDetail,
            dump.isMainPage(articleId),
          ),
        ).rejects.toThrowError(new Error('Request failed with status code 404'))
      })
    }
  })

  const describeIf = process.env.S3_URL ? describe : describe.skip

  describeIf('Downloader class with optimisation', () => {
    let downloader: Downloader
    let s3: S3
    const s3UrlObj = urlParser.parse(`${process.env.S3_URL}`, true)

    beforeAll(async () => {
      MediaWiki.base = 'https://en.wikipedia.org'
      MediaWiki.getCategories = true

      s3 = new S3(
        `${s3UrlObj.protocol}//${s3UrlObj.host}/`,
        {
          bucketName: s3UrlObj.query.bucketName,
          keyId: s3UrlObj.query.keyId,
          secretAccessKey: s3UrlObj.query.secretAccessKey,
        },
        1000 * 60,
        false,
      )
      downloader = new Downloader({
        uaString: `${config.userAgent} (contact@kiwix.org)`,
        speed: 1,
        reqTimeout: 1000 * 60,
        webp: false,
        optimisationCacheUrl: 'random-string',
        s3,
      })

      await s3.initialise()
    })

    test('Delete image from S3', async () => {
      const testImage = 'https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.png'

      // Strip http(s) from url
      const httpOrHttpsRemoved = stripHttpFromUrl(testImage)
      expect(httpOrHttpsRemoved).toEqual('bm.wikipedia.org/static/images/project-logos/bmwiki-2x.png')

      // Delete the image already present in S3
      await s3.deleteBlob({ Bucket: s3UrlObj.query.bucketName as string, Key: httpOrHttpsRemoved })

      // Check if image exists after deleting from S3
      const imageNotExists = await s3.downloadBlob(httpOrHttpsRemoved)
      expect(imageNotExists).toBeNull()
    })

    test('Check Etag image flow from S3', async () => {
      // Get an image URL to run the test with
      const randomImage = await getRandomImageUrl()
      const imagePath = stripHttpFromUrl(randomImage)
      await s3.deleteBlob({ Bucket: s3UrlObj.query.bucketName as string, Key: imagePath })

      // Download the image (and cache it in S3)
      await downloader.downloadContent(randomImage, 'image')

      // Async downloadContent(), waiting this is done
      await setTimeout(5000)

      // Check if S3 Etag is like online Etag
      const upstreamResp = await Axios(randomImage)
      const s3Resp = await s3.downloadBlob(imagePath)
      expect(downloader.removeEtagWeakPrefix(`${upstreamResp.headers.etag}`)).toEqual(s3Resp.Metadata.etag)

      // Overwrite Image with new Etag to S3
      const newEtag = '686897696a7c876b7e'
      await s3.uploadBlob(imagePath, upstreamResp.data, newEtag, '1')
      await setTimeout(10000)

      // Download again to check the Etag has been overwritten properly
      const newS3Resp = await s3.downloadBlob(imagePath)
      expect(newS3Resp.Metadata.etag).toEqual(newEtag)

      // Remove Image after test
      await s3.deleteBlob({ Bucket: s3UrlObj.query.bucketName as string, Key: imagePath })
    })
  })

  async function getRandomImageUrl(): Promise<string> {
    const resp = await Axios(
      'https://commons.wikimedia.org/w/api.php?action=query&generator=random&grnnamespace=6&prop=imageinfo&iiprop=url&formatversion=2&iiurlwidth=100&format=json&formatversion=2',
    )
    return resp.data.query.pages[0].imageinfo[0].url
  }
})
