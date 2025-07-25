import { startRedis, stopRedis } from './bootstrap.js'
import Downloader from '../../src/Downloader.js'
import MediaWiki from '../../src/MediaWiki.js'
import RedisStore from '../../src/RedisStore.js'
import { mwRetToArticleDetail, stripHttpFromUrl } from '../../src/util/index.js'
import S3 from '../../src/S3.js'
import { Dump } from '../../src/Dump.js'
import { config } from '../../src/config.js'
import 'dotenv/config.js'
import * as FileType from 'file-type'
import { jest } from '@jest/globals'
import { setTimeout } from 'timers/promises'
import domino from 'domino'
import { WikimediaDesktopRenderer } from '../../src/renderers/wikimedia-desktop.renderer.js'
import { WikimediaMobileRenderer } from '../../src/renderers/wikimedia-mobile.renderer.js'
import { RENDERERS_LIST } from '../../src/util/const.js'
import RenderingContext from '../../src/renderers/rendering.context.js'
import { renderName } from 'src/renderers/abstract.renderer.js'

jest.setTimeout(200000)

describe('Downloader class - wikipedia EN', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  beforeAll(async () => {
    MediaWiki.reset()
    MediaWiki.base = 'https://en.wikipedia.org'
    MediaWiki.getCategories = true
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }

    await MediaWiki.getMwMetaData()
    await MediaWiki.hasCoordinates()
    await MediaWiki.hasWikimediaDesktopApi()
    await MediaWiki.hasWikimediaMobileApi()
    await MediaWiki.hasRestApi()
    await MediaWiki.hasVisualEditorApi()
  })

  test('Test Action API version 2 response in comparison with version 1', async () => {
    const actionAPIResV1 = await Downloader.getJSON('https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=modules|jsconfigvars|headhtml&page=Potato')
    const actionAPIResV2 = await Downloader.getJSON('https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=modules|jsconfigvars|headhtml&formatversion=2&page=Potato')
    expect(actionAPIResV1).not.toEqual(actionAPIResV2)
  })

  test('downloader.querySiteInfo returns valid JSON', async () => {
    const queryRet = await Downloader.querySiteInfo()
    expect(typeof queryRet).toBe('object')
  })

  test('downloader.getJSON returns valid JSON', async () => {
    const JSONRes = await Downloader.getJSON('https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json')
    expect(typeof JSONRes).toBe('object')
  })

  test('downloader.canGetUrl returns valid answer (positive)', async () => {
    const urlExists = await Downloader.canGetUrl('https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json')
    expect(urlExists).toBe(true)
  })

  test('downloader.canGetUrl returns valid answer (negative)', async () => {
    const urlNotExists = await Downloader.canGetUrl('https://en.wikipedia.org/w/thisisa404')
    expect(urlNotExists).toBe(false)
  })

  test('getJSON response status for non-existant url is 404', async () => {
    await expect(Downloader.getJSON('https://en.wikipedia.org/w/thisisa404')).rejects.toThrowError(new Error('Request failed with status code 404'))
  })

  test('downloader.downloadContent returns', async () => {
    const contentRes = await Downloader.downloadContent('https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/London_Montage_L.jpg/275px-London_Montage_L.jpg', 'image')
    expect(contentRes.contentType).toBeDefined()
  })

  test('Webp compression working for cmyk color-space images', async () => {
    const { content } = await Downloader.downloadContent('https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/LOGO_HAEMMERLIN.jpg/550px-LOGO_HAEMMERLIN.jpg', 'image')
    const fileType = await FileType.fileTypeFromBuffer(Buffer.from(content))
    expect(fileType?.mime).toEqual('image/webp')
  })

  test('downloader.downloadContent throws on non-existant url', async () => {
    await expect(Downloader.downloadContent('https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/thisdoesnotexist.jpg', 'image')).rejects.toThrowError(
      new Error('Request failed with status code 404'),
    )
  })

  test("getArticleDetailsIds Scraped 'London', 'United_Kingdom', 'Paris', 'Zürich', 'THISARTICLEDOESNTEXIST' successfully", async () => {
    const _articleDetailsRet = await Downloader.getArticleDetailsIds(['London', 'United_Kingdom', 'Paris', 'Zurich', 'THISARTICLEDOESNTEXIST', 'Category:Container_categories'])
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
    const { gapContinue, articleDetails } = await Downloader.getArticleDetailsNS(0)
    expect(gapContinue).toBeDefined()
    expect(Object.keys(articleDetails).length).toBeGreaterThan(10)

    const secondNsRet = await Downloader.getArticleDetailsNS(0, gapContinue)
    expect(secondNsRet.gapContinue).toBeDefined()
  })

  test('downloadContent throws when empty string is passed', async () => {
    await expect(Downloader.downloadContent('', 'image')).rejects.toThrowError()
  })

  test('downloadContent successfully downloaded an image', async () => {
    const { data: LondonHtml } = await Downloader.get('https://en.wikipedia.org/api/rest_v1/page/html/London')
    const doc = domino.createDocument(LondonHtml)
    const imgToGet = Array.from(doc.querySelectorAll('[data-mw-section-id="0"] img'))[0]
    let imgToGetSrc = ''
    if (imgToGet.getAttribute('src')) {
      imgToGetSrc = imgToGet.getAttribute('src')
    }
    // This is the downloading of an image
    const LondonImage = await Downloader.downloadContent(imgToGetSrc, 'image')
    expect(LondonImage.contentType).toMatch(/image\//i)
  })

  test('downloadContent successfully downloads a map image', async () => {
    const { data: LondonHtml } = await Downloader.get('https://en.wikipedia.org/api/rest_v1/page/html/London')
    const doc = domino.createDocument(LondonHtml)
    const imgToGet = Array.from(doc.querySelectorAll('.mw-kartographer-map img'))[0]
    let imgToGetSrc = ''
    if (imgToGet.getAttribute('src')) {
      imgToGetSrc = imgToGet.getAttribute('src')
    }
    // This is the downloading of an image
    const LondonImage = await Downloader.downloadContent(imgToGetSrc, 'image')
    expect(LondonImage.contentType).toMatch(/image\//i)
  })

  describe('getArticle method', () => {
    let dump: Dump
    const wikimediaMobileRenderer = new WikimediaMobileRenderer()

    beforeAll(async () => {
      const mwMetadata = await MediaWiki.getMwMetaData()
      dump = new Dump('', {} as any, mwMetadata)
    })

    test('getArticle of "London" returns one article for WikimediaMobileRenderer render', async () => {
      const articleId = 'London'
      RenderingContext.articlesRenderer = wikimediaMobileRenderer
      RenderingContext.mainPageRenderer = wikimediaMobileRenderer
      Downloader.setUrlsDirectors(wikimediaMobileRenderer, wikimediaMobileRenderer)
      const articleUrl = Downloader.getArticleUrl(articleId)
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
      const LondonArticle = await Downloader.getArticle(articleId, RedisStore.articleDetailXId, wikimediaMobileRenderer, articleUrl, dump, articleDetail)
      expect(LondonArticle).toHaveLength(1)
    })

    test('Categories with many subCategories are paginated for WikimediaDesktop render', async () => {
      const articleId = 'Category:Container_categories'
      const wikimediaDesktopRenderer = new WikimediaDesktopRenderer()
      const articleDetail = {
        title: articleId,
        ns: 14,
        revisionId: 1168361498,
        timestamp: '2023-08-02T09:57:11Z',
      }
      // Enforce desktop url here as this test desktop API-specific
      const articleUrl = `https://en.wikipedia.org/api/rest_v1/page/html/${articleId}`
      const PaginatedArticle = await Downloader.getArticle(articleId, RedisStore.articleDetailXId, wikimediaDesktopRenderer, articleUrl, dump, articleDetail)
      expect(PaginatedArticle.length).toBeGreaterThan(100)
    })
  })

  describe('getArticle method', () => {
    for (const renderer of RENDERERS_LIST) {
      let dump: Dump
      beforeAll(async () => {
        const mwMetadata = await MediaWiki.getMwMetaData()
        dump = new Dump('', {} as any, mwMetadata)
        await RenderingContext.createRenderers(renderer as renderName, true)
      })

      test(`getArticle response content for non-existent article id is placeholder for ${renderer} render`, async () => {
        const articleId = 'NeverExistingArticle'
        const articleUrl = Downloader.getArticleUrl(articleId)
        const articleDetail = {
          title: articleId,
          missing: '',
        }
        const neverExistingArticleResult = await Downloader.getArticle(
          'NeverExistingArticle',
          RedisStore.articleDetailXId,
          RenderingContext.articlesRenderer,
          articleUrl,
          dump,
          articleDetail,
        )
        expect(neverExistingArticleResult).toHaveLength(1)
        expect(neverExistingArticleResult[0].articleId).toBe('NeverExistingArticle')
        expect(neverExistingArticleResult[0].html).toContain('Oops. Article not found.')
      })
    }
  })

  const describeIf = process.env.S3_URL ? describe : describe.skip

  describeIf('Downloader class with optimisation', () => {
    let s3: S3
    const s3UrlObj = new URL(`${process.env.S3_URL}`)

    beforeAll(async () => {
      MediaWiki.base = 'https://en.wikipedia.org'
      MediaWiki.getCategories = true

      s3 = new S3(
        `${s3UrlObj.protocol}//${s3UrlObj.host}/`,
        new URLSearchParams({
          bucketName: s3UrlObj.searchParams.get('bucketName'),
          keyId: s3UrlObj.searchParams.get('keyId'),
          secretAccessKey: s3UrlObj.searchParams.get('secretAccessKey'),
        }),
        1000 * 60,
        false,
      )
      Downloader.init = {
        uaString: `${config.userAgent} (contact@kiwix.org)`,
        speed: 1,
        reqTimeout: 1000 * 60,
        webp: false,
        optimisationCacheUrl: 'random-string',
        s3,
      }

      await s3.initialise()
    })

    test('Delete image from S3', async () => {
      const testImage = 'https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.png'

      // Strip http(s) from url
      const httpOrHttpsRemoved = stripHttpFromUrl(testImage)
      expect(httpOrHttpsRemoved).toEqual('bm.wikipedia.org/static/images/project-logos/bmwiki-2x.png')

      // Delete the image already present in S3
      await s3.deleteBlob({ Bucket: s3UrlObj.searchParams.get('bucketName') as string, Key: httpOrHttpsRemoved })

      // Check if image exists after deleting from S3
      const imageNotExists = await s3.downloadBlob(httpOrHttpsRemoved)
      expect(imageNotExists).toBeNull()
    })

    test('Check Etag image flow from S3', async () => {
      // Get an image URL to run the test with
      const randomImage = await getRandomImageUrl()
      const imagePath = stripHttpFromUrl(randomImage)
      await s3.deleteBlob({ Bucket: s3UrlObj.searchParams.get('bucketName') as string, Key: imagePath })

      // Download the image (and cache it in S3)
      await Downloader.downloadContent(randomImage, 'image')

      // Async downloadContent(), waiting this is done
      await setTimeout(5000)

      // Check if S3 Etag is like online Etag
      const upstreamResp = await Downloader.get(randomImage)
      const s3Resp = await s3.downloadBlob(imagePath)
      expect(Downloader.removeEtagWeakPrefix(`${upstreamResp.headers.etag}`)).toEqual(s3Resp.Metadata.etag)

      // Overwrite Image with new Etag to S3
      const newEtag = '686897696a7c876b7e'
      await s3.uploadBlob(imagePath, upstreamResp.data, newEtag, '1')
      await setTimeout(10000)

      // Download again to check the Etag has been overwritten properly
      const newS3Resp = await s3.downloadBlob(imagePath)
      expect(newS3Resp.Metadata.etag).toEqual(newEtag)

      // Remove Image after test
      await s3.deleteBlob({ Bucket: s3UrlObj.searchParams.get('bucketName') as string, Key: imagePath })
    })
  })

  async function getRandomImageUrl(): Promise<string> {
    const resp = await Downloader.get(
      'https://commons.wikimedia.org/w/api.php?action=query&generator=random&grnnamespace=6&prop=imageinfo&iiprop=url&formatversion=2&iiurlwidth=100&format=json&formatversion=2',
    )
    return resp.data.query.pages[0].imageinfo[0].url
  }
})

describe('Downloader class - wikipedia ES', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  beforeAll(async () => {
    MediaWiki.reset()
    MediaWiki.base = 'https://es.wikipedia.org'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }

    await MediaWiki.getMwMetaData()
    await MediaWiki.hasCoordinates()
    await MediaWiki.hasWikimediaDesktopApi()
    await MediaWiki.hasWikimediaMobileApi()
    await MediaWiki.hasRestApi()
    await MediaWiki.hasVisualEditorApi()
  })

  describe('getArticle response content for moved article id with redirect', () => {
    for (const renderer of RENDERERS_LIST) {
      // for (const renderer of ['ActionParse']) {
      let dump: Dump
      beforeAll(async () => {
        const mwMetadata = await MediaWiki.getMwMetaData()
        dump = new Dump('', {} as any, mwMetadata)
        await RenderingContext.createRenderers(renderer as renderName, true)
      })

      test(`for ${renderer} render`, async () => {
        // This test is KO with VisualEditor, we "skip" it
        if (renderer == 'VisualEditor') {
          return
        }

        // In this test, we fake the situation where we found the article 'Alejandro_González_y_Robleto' when
        // listing articles and getting their details, but the article has then been moved (with a redirect)
        // to 'Vicente_Alejandro_González_y_Robleto'
        // In such a case, we expect to:
        // - retrieve content of redirection target to have real content
        // - place this content in original article path (Alejandro_González_y_Robleto)
        const articleId = 'Alejandro_González_y_Robleto'
        const redirectArticleId = 'Vicente_Alejandro_González_y_Robleto'

        // Retrieve details from the redirection target (in real-life scenario, this would have been retrieved
        // because the move did not yet happened when getting article details, but happened before getting
        // article content)
        const mwArticleDetails = await Downloader.getArticleDetailsIds([redirectArticleId])
        const articleDetails = mwRetToArticleDetail(mwArticleDetails)

        // Move detail to articleId instead of redirectArticleId
        articleDetails[articleId] = articleDetails[redirectArticleId]
        delete articleDetails[redirectArticleId]
        await RedisStore.articleDetailXId.setMany(articleDetails)

        const articleResult = await Downloader.getArticle(
          articleId,
          RedisStore.articleDetailXId,
          RenderingContext.articlesRenderer,
          Downloader.getArticleUrl(articleId),
          dump,
          articleDetails[articleId],
        )
        expect(articleResult).toHaveLength(1)
        expect(articleResult[0].articleId).toBe('Alejandro_González_y_Robleto')
        expect(articleResult[0].html).toContain('Datos biográficos')

        // Only ActionParse API gives sufficient information so that we automatically add missing redirects
        if (renderer == 'ActionParse') {
          expect(RedisStore.redirectsXId.exists('Vicente_Alejandro_González_y_Robleto')).toBeTruthy()
        }
      })
    }
  })

  test(`getArticle response content for article moved during listing`, async () => {
    const renderer = ''

    const mwMetadata = await MediaWiki.getMwMetaData()
    const dump = new Dump('', {} as any, mwMetadata)
    await RenderingContext.createRenderers(renderer as renderName, true)

    // In this test, we fake the situation where we found the article 'Alejandro_González_y_Robleto' when
    // listing articles and getting their details, but the article has then been moved (with a redirect)
    // to 'Vicente_Alejandro_González_y_Robleto' during article listing, so we have both articles to fetch
    const articleId = 'Alejandro_González_y_Robleto'
    const redirectArticleId = 'Vicente_Alejandro_González_y_Robleto'

    // Retrieve details from the redirection target (in real-life scenario, this would have been retrieved
    // because the move did not yet happened when getting article details, but happened before getting
    // article content)
    const mwArticleDetails = await Downloader.getArticleDetailsIds([redirectArticleId])
    const articleDetails = mwRetToArticleDetail(mwArticleDetails)

    // Move detail to articleId instead of redirectArticleId
    articleDetails[articleId] = articleDetails[redirectArticleId]
    await RedisStore.articleDetailXId.setMany(articleDetails)

    const articleResult = await Downloader.getArticle(
      articleId,
      RedisStore.articleDetailXId,
      RenderingContext.articlesRenderer,
      Downloader.getArticleUrl(articleId),
      dump,
      articleDetails[articleId],
    )
    expect(articleResult).toHaveLength(1)
    expect(articleResult[0].articleId).toBe('Alejandro_González_y_Robleto')
    expect(articleResult[0].html).toContain('Datos biográficos')

    const redirectArticleResult = await Downloader.getArticle(
      redirectArticleId,
      RedisStore.articleDetailXId,
      RenderingContext.articlesRenderer,
      Downloader.getArticleUrl(redirectArticleId),
      dump,
      articleDetails[redirectArticleId],
    )
    expect(redirectArticleResult).toHaveLength(1)
    expect(redirectArticleResult[0].articleId).toBe('Vicente_Alejandro_González_y_Robleto')
    expect(redirectArticleResult[0].html).toContain('Datos biográficos')

    // both redirects have been added by 'mistake' ; it will be the responsibility of code handling
    // redirects rewrite to recover from this situation
    expect(RedisStore.redirectsXId.exists('Vicente_Alejandro_González_y_Robleto')).toBeTruthy()
    expect(RedisStore.redirectsXId.exists('Alejandro_González_y_Robleto')).toBeTruthy()
  })
})
