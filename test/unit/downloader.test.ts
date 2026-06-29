import { startRedis, stopRedis } from './bootstrap.js'
import Downloader from '../../src/Downloader.js'
import MediaWiki from '../../src/MediaWiki.js'
import RedisStore from '../../src/RedisStore.js'
import { mwRetToPageDetail, stripHttpFromUrl } from '../../src/util/index.js'
import S3 from '../../src/S3.js'
import { Dump } from '../../src/Dump.js'
import { createTranslator } from '../../src/i18n.js'
import { config } from '../../src/config.js'
import 'dotenv/config.js'
import * as FileType from 'file-type'
import { jest } from '@jest/globals'
import { setTimeout } from 'timers/promises'
import domino from 'domino'
import { RENDERERS_LIST } from '../../src/util/const.js'
import RenderingContext from '../../src/renderers/rendering.context.js'
import { renderName } from '../../src/renderers/abstract.renderer.js'

jest.setTimeout(200000)

describe('Downloader class - wikipedia EN', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  beforeAll(async () => {
    MediaWiki.reset()
    MediaWiki.base = 'https://en.wikipedia.org'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, workers: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }
    await MediaWiki.getMwMetaData()
    await MediaWiki.hasCoordinates()
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
    await expect(Downloader.getJSON('https://en.wikipedia.org/w/thisisa404')).rejects.toThrow(new Error('Request failed with status code 404'))
  })

  test('downloader.downloadContent returns', async () => {
    const contentRes = await Downloader.downloadContent('https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/London_Montage_L.jpg/250px-London_Montage_L.jpg', 'image')
    expect(contentRes.contentType).toBeDefined()
  })

  test('Webp compression working for cmyk color-space images', async () => {
    const { content } = await Downloader.downloadContent('https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/LOGO_HAEMMERLIN.jpg/500px-LOGO_HAEMMERLIN.jpg', 'image')
    const fileType = await FileType.fileTypeFromBuffer(Buffer.from(content))
    expect(fileType?.mime).toEqual('image/webp')
  })

  test('downloader.downloadContent throws on non-existant url', async () => {
    await expect(Downloader.downloadContent('https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/thisdoesnotexist.jpg/500px-thisdoesnotexist.jpg', 'image')).rejects.toThrow(
      new Error('Request failed with status code 404'),
    )
  })

  test("getPagesByTitle Scraped 'London', 'United_Kingdom', 'Paris', 'Zürich', 'THISPAGEDOESNTEXIST' successfully", async () => {
    const _pageDetailsRet = await Downloader.getPagesByTitle(['London', 'United_Kingdom', 'Paris', 'Zurich', 'THISPAGEDOESNTEXIST', 'Category:Container_categories'] as PageTitle[])
    const pageDetailsRet = mwRetToPageDetail(_pageDetailsRet)
    RedisStore.pagesStore.setMany(pageDetailsRet)
    const London = pageDetailsRet['London']
    const Paris = pageDetailsRet['Paris']
    const Zurich = pageDetailsRet['Zurich']
    const United_Kingdom = pageDetailsRet['United Kingdom']
    const THISPAGEDOESNTEXIST = pageDetailsRet['THISPAGEDOESNTEXIST']
    expect(London).toBeDefined()
    expect(United_Kingdom).toBeDefined()
    expect(Paris).toBeDefined()
    expect(Zurich).toBeDefined()
    expect(THISPAGEDOESNTEXIST).toBeDefined()
    expect(THISPAGEDOESNTEXIST.missing).toBe(true)
  })

  test("getPagesByNamespace query returns 'gapContinue' or 'multiple pages', ", async () => {
    const { gapContinue, pages: pageDetails } = await Downloader.getPagesByNamespace(0)
    expect(gapContinue).toBeDefined()
    expect(Object.keys(pageDetails).length).toBeGreaterThan(10)

    const secondNsRet = await Downloader.getPagesByNamespace(0, gapContinue)
    expect(secondNsRet.gapContinue).toBeDefined()
  })

  test('downloadContent throws when empty string is passed', async () => {
    await expect(Downloader.downloadContent('', 'image')).rejects.toThrow()
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

  describe('getPage method', () => {
    for (const renderer of RENDERERS_LIST) {
      let dump: Dump
      beforeAll(async () => {
        const mwMetadata = await MediaWiki.getMwMetaData()
        const t = await createTranslator(mwMetadata.langIso2 || 'en', 'en')
        dump = new Dump('', '', {} as any, mwMetadata, undefined, t)
        await RenderingContext.createRenderers(renderer as renderName)
      })

      test(`getPage response content for non-existent page title is placeholder for ${renderer} render`, async () => {
        const pageTitle = 'NeverExistingPage' as PageTitle
        const pageUrl = Downloader.getPageUrl(pageTitle)
        const pageDetail = {
          title: pageTitle,
          missing: '',
        }
        const pageResult = await Downloader.getPage(pageTitle, RenderingContext.pagesRenderer, pageUrl, dump, pageDetail)
        expect(pageResult.items).toHaveLength(1)
        expect(pageResult.needsDownloadErrorStaticFiles).toBe(true)
        expect(pageResult.items[0].pageTitle).toBe('NeverExistingPage')
        expect(pageResult.items[0].zimPath).toBe('NeverExistingPage')
        expect(pageResult.items[0].zimTitle).toBe('')
        expect(pageResult.items[0].htmlContent).toContain('Oops. Page not found.')
      })
    }
  })

  const describeIf = process.env.S3_URL ? describe : describe.skip

  describeIf('Downloader class with optimisation', () => {
    let s3: S3
    let s3UrlObj: URL

    beforeAll(async () => {
      MediaWiki.base = 'https://en.wikipedia.org'
      MediaWiki.getCategories = true

      s3UrlObj = new URL(`${process.env.S3_URL}`)
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
        workers: 1,
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
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, workers: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }

    await MediaWiki.getMwMetaData()
    await MediaWiki.hasCoordinates()
  })

  describe('getPagesByTitle response content for moved page id with redirect', () => {
    for (const renderer of RENDERERS_LIST) {
      // for (const renderer of ['ActionParse']) {
      let dump: Dump
      beforeAll(async () => {
        const mwMetadata = await MediaWiki.getMwMetaData()
        const t = await createTranslator(mwMetadata.langIso2 || 'en', 'en')
        dump = new Dump('', '', {} as any, mwMetadata, undefined, t)
        await RenderingContext.createRenderers(renderer as renderName)
      })

      test(`for ${renderer} render`, async () => {
        // In this test, we fake the situation where we found the page 'Alejandro González y Robleto' when
        // listing pages and getting their details, but the page has then been moved (with a redirect)
        // to 'Vicente Alejandro González y Robleto'
        // In such a case, we expect to:
        // - retrieve content of redirection target to have real content
        // - place this content in original page path (Alejandro González y Robleto)
        const pageTitle = 'Alejandro González y Robleto' as PageTitle
        const redirectPageTitle = 'Vicente Alejandro González y Robleto' as PageTitle

        // Retrieve details from the redirection target (in real-life scenario, this would have been retrieved
        // because the move did not yet happened when getting page details, but happened before getting
        // page content)
        const mwPageDetails = await Downloader.getPagesByTitle([redirectPageTitle])
        const pageDetails = mwRetToPageDetail(mwPageDetails)

        // Move detail to pageTitle instead of redirectPageTitle
        pageDetails[pageTitle] = pageDetails[redirectPageTitle]
        delete pageDetails[redirectPageTitle]
        await RedisStore.pagesStore.setMany(pageDetails)

        const pageResult = await Downloader.getPage(pageTitle, RenderingContext.pagesRenderer, Downloader.getPageUrl(pageTitle), dump, pageDetails[pageTitle])
        expect(pageResult.items).toHaveLength(1)
        expect(pageResult.needsDownloadErrorStaticFiles).toBe(false)
        expect(pageResult.items[0].pageTitle).toBe('Alejandro González y Robleto')
        expect(pageResult.items[0].zimPath).toBe('Alejandro_González_y_Robleto')
        expect(pageResult.items[0].zimTitle).toBe('Alejandro González y Robleto')
        expect(pageResult.items[0].htmlContent).toContain('Datos biográficos')

        // Only ActionParse API gives sufficient information so that we automatically add missing redirects
        if (renderer == 'ActionParse') {
          expect(RedisStore.redirectsStore.exists('Vicente Alejandro González y Robleto')).toBeTruthy()
        }
      })
    }
  })

  test(`getPagesByTitle response content for page moved during listing`, async () => {
    const renderer = ''

    const mwMetadata = await MediaWiki.getMwMetaData()
    const t = await createTranslator(mwMetadata.langIso2 || 'en', 'en')
    const dump = new Dump('', '', {} as any, mwMetadata, undefined, t)
    await RenderingContext.createRenderers(renderer as renderName)

    // In this test, we fake the situation where we found the page 'Alejandro González y Robleto' when
    // listing pages and getting their details, but the page has then been moved (with a redirect)
    // to 'Vicente Alejandro González y Robleto' during page listing, so we have both pages to fetch
    const pageTitle = 'Alejandro González y Robleto' as PageTitle
    const redirectPageTitle = 'Vicente Alejandro González y Robleto' as PageTitle

    // Retrieve details from the redirection target (in real-life scenario, this would have been retrieved
    // because the move did not yet happened when getting page details, but happened before getting
    // page content)
    const mwPageDetails = await Downloader.getPagesByTitle([redirectPageTitle])
    const pageDetails = mwRetToPageDetail(mwPageDetails)

    // Move detail to pageTitle instead of redirectPageTitle
    pageDetails[pageTitle] = pageDetails[redirectPageTitle]
    await RedisStore.pagesStore.setMany(pageDetails)

    const pageResult = await Downloader.getPage(pageTitle, RenderingContext.pagesRenderer, Downloader.getPageUrl(pageTitle), dump, pageDetails[pageTitle])
    expect(pageResult.items).toHaveLength(1)
    expect(pageResult.needsDownloadErrorStaticFiles).toBe(false)
    expect(pageResult.items[0].pageTitle).toBe('Alejandro González y Robleto')
    expect(pageResult.items[0].zimPath).toBe('Alejandro_González_y_Robleto')
    expect(pageResult.items[0].zimTitle).toBe('Alejandro González y Robleto')
    expect(pageResult.items[0].htmlContent).toContain('Datos biográficos')

    const redirectPageResult = await Downloader.getPage(
      redirectPageTitle,
      RenderingContext.pagesRenderer,
      Downloader.getPageUrl(redirectPageTitle),
      dump,
      pageDetails[redirectPageTitle],
    )
    expect(redirectPageResult.items).toHaveLength(1)
    expect(redirectPageResult.needsDownloadErrorStaticFiles).toBe(false)
    expect(redirectPageResult.items[0].pageTitle).toBe('Vicente Alejandro González y Robleto')
    expect(redirectPageResult.items[0].zimPath).toBe('Vicente_Alejandro_González_y_Robleto')
    expect(redirectPageResult.items[0].zimTitle).toBe('Vicente Alejandro González y Robleto')
    expect(redirectPageResult.items[0].htmlContent).toContain('Datos biográficos')

    // both redirects have been added by 'mistake' ; it will be the responsibility of code handling
    // redirects rewrite to recover from this situation
    expect(RedisStore.redirectsStore.exists('Vicente Alejandro González y Robleto')).toBeTruthy()
    expect(RedisStore.redirectsStore.exists('Alejandro González y Robleto')).toBeTruthy()
  })
})
