import {startRedis, stopRedis} from './bootstrap.js';
import Downloader from '../../src/Downloader.js';
import MediaWiki from '../../src/MediaWiki.js';
import Axios from 'axios';
import { mkdirPromise, mwRetToArticleDetail, stripHttpFromUrl, isImageUrl } from '../../src/util/index.js';
import S3 from '../../src/S3.js';
import rimraf from 'rimraf';
import { Dump } from '../../src/Dump';
import { articleDetailXId } from '../../src/stores.js';
import { config } from '../../src/config.js';
import 'dotenv/config.js';
import * as FileType from 'file-type';
import {jest} from '@jest/globals';
import urlParser from 'url';
import {setTimeout} from 'timers/promises';

jest.setTimeout(100000);

describe('Downloader class', () => {
  let mw: MediaWiki;
  let downloader: Downloader;
  const cacheDir = `cac/dumps-${Date.now()}/`;

  beforeAll(startRedis);
  afterAll(stopRedis);

  beforeAll(async () => {
    mw = new MediaWiki({
      base: 'https://en.wikipedia.org',
      getCategories: true,
    } as any);

    await mkdirPromise(cacheDir);
    downloader = new Downloader({ mw, uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' });

    await mw.getMwMetaData(downloader);
    await downloader.checkCapabilities();
    await downloader.setBaseUrls();
  });

  test('downloader.query returns valid JSON', async() => {
    const queryRet = await downloader.query(`?action=query&meta=siteinfo&siprop=statistics&format=json`);
    expect(queryRet).toBeDefined();
  });

  test('downloader.getJSON returns valid JSON', async() => {
    const JSONRes = await downloader.getJSON(`https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json`);
    expect(JSONRes).toBeDefined();
  });

  test('downloader.canGetUrl returns valid answer (positive)', async() => {
    const urlExists = await downloader.canGetUrl(`https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json`);
    expect(urlExists).toBeDefined();
  });

  test('downloader.canGetUrl returns valid answer (negative)', async() => {
    const urlNotExists = await downloader.canGetUrl(`https://en.wikipedia.org/w/thisisa404`);
    expect(urlNotExists).toBeDefined();
  });

  test('getJSON response status for non-existant url is 404', async() => {
    await expect(downloader.getJSON(`https://en.wikipedia.org/w/thisisa404`)).rejects.toThrowError(new Error('Request failed with status code 404'));
  });

  test('downloader.downloadContent returns', async() => {
    const contentRes = await downloader.downloadContent(`https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/London_Montage_L.jpg/275px-London_Montage_L.jpg`);
    expect(contentRes.responseHeaders).toBeDefined();
  });

  test('Webp compression working for cmyk color-space images', async() => {
    const {content} = await downloader.downloadContent(`https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/LOGO_HAEMMERLIN.jpg/550px-LOGO_HAEMMERLIN.jpg`);
    const fileType = await FileType.fileTypeFromBuffer(Buffer.from(content))
    expect(fileType?.mime).toEqual('image/webp');
  });

  test('downloader.downloadContent throws on non-existant url', async() => {
    await expect(downloader.downloadContent(`https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/thisdoesnotexist.jpg`))
      .rejects
      .toThrowError(new Error('Request failed with status code 404'));
  });

  test('getArticleDetailsIds Scraped \'London\', \'United_Kingdom\', \'Paris\', \'Zürich\', \'THISARTICLEDOESNTEXIST\' successfully', async() => {
    const _articleDetailsRet = await downloader.getArticleDetailsIds(['London', 'United_Kingdom', 'Paris', 'Zürich', 'THISARTICLEDOESNTEXIST', 'Category:Container_categories']);
    const articleDetailsRet = mwRetToArticleDetail(_articleDetailsRet);
    articleDetailXId.setMany(articleDetailsRet);
    const { London, Paris, Zürich, United_Kingdom, THISARTICLEDOESNTEXIST } = articleDetailsRet;
    expect(London).toBeDefined();
    expect(United_Kingdom).toBeDefined();
    expect(Paris).toBeDefined();
    expect(Zürich).toBeDefined();

    expect(THISARTICLEDOESNTEXIST.missing).toBe('');
  });

  test('getArticleDetailsNS query returns \'gapContinue\' or \'multiple articles\', ', async() => {
    const { gapContinue, articleDetails } = await downloader.getArticleDetailsNS(0);
    expect(gapContinue).toBeDefined();
    expect(Object.keys(articleDetails).length).toBeGreaterThan(10);

    const secondNsRet = await downloader.getArticleDetailsNS(0, gapContinue);
    expect(secondNsRet.gapContinue).toBeDefined();
  });

  test('downloadContent throws when empty string is passed', async() => {
      await expect(downloader.downloadContent('')).rejects.toThrowError();
  });

  test('downloadContent successfully downloaded an image', async() => {
    const { data: LondonDetail } = await Axios.get(`https://en.wikipedia.org/api/rest_v1/page/mobile-sections/London`);
    const [imgToGet] = Object.values(LondonDetail.lead.image.urls);

    const LondonImage = await downloader.downloadContent(imgToGet as string);
    expect(LondonImage.responseHeaders['content-type']).toMatch(/image\//i);
  });

  describe('getArticle method', () => {
    let dump: Dump;

    beforeAll(async () => {
      const mwMetadata = await mw.getMwMetaData(downloader);
      dump = new Dump('', {} as any, mwMetadata);
    });

    test('getArticle of "London" returns one article', async() => {
      const LondonArticle = await downloader.getArticle('London', dump);
      expect(LondonArticle).toHaveLength(1)
    });

    test('Categories with many subCategories are paginated', async() => {
      const PaginatedArticle = await downloader.getArticle('Category:Container_categories', dump);
      expect(PaginatedArticle.length).toBeGreaterThan(100)
    });

    test('getArticle response status for non-existent article id is 404', async() => {
        await expect(downloader.getArticle('NeverExistingArticle', dump))
          .rejects
          .toThrowError(new Error('Request failed with status code 404'));
    });
  });

  describe('isImageUrl method', () => {
    beforeAll(async () => {
      rimraf.sync(cacheDir);
    });

    test('Checked Image type: png', async() => {
      const isPngFile = isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.svg.png');
      expect(isPngFile).toBeTruthy();
    });

    test('Checked Image type: jpg', async() => {
      const isJpgFile = isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.JPG');
      expect(isJpgFile).toBeTruthy();
    });

    test('Checked Image type: svg', async() => {
      const isSvgFile = isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.svg');
      expect(isSvgFile).toBeTruthy();
    });

    test('Checked Image type: jpeg', async() => {
      const isJpegFile = isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.JPEG');
      expect(isJpegFile).toBeTruthy();
    });

    test('Checked Image type: gif', async() => {
      const isgifFile = isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.gif');
      expect(isgifFile).toBeTruthy();
    });

    test('Checked Image URL with arguments', async() => {
      const isgifFileWithArgs = isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.gif?foo=bar');
      expect(isgifFileWithArgs).toBeTruthy();
    });

    test('Url is not image type', async() => {
      const isnotImage = isImageUrl('https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json');
      expect(isnotImage).not.toBeTruthy();
    });

    test('Url is empty string', async() => {
      const isEmptyString = isImageUrl('');
      expect(isEmptyString).not.toBeTruthy();
    });

    test('Image Url has no extension', async() => {
      const imageHasNoExtension = isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x');
      expect(imageHasNoExtension).not.toBeTruthy();
    });

    test('Image Url extension is undefined', async() => {
      const extensionIsUndefined =  isImageUrl('https://bm.wikipedia.org/static/images/project-logos/undefined');
      expect(extensionIsUndefined).not.toBeTruthy();
    });
  });

  const describeIf = process.env.S3_URL ? describe : describe.skip;

  describeIf('Downloader class with optimisation', () => {
    let downloader: Downloader;
    let s3: S3;
    const s3UrlObj = urlParser.parse(`${process.env.S3_URL}`, true);

    beforeAll(async () => {
      const mw = new MediaWiki({
          base: 'https://en.wikipedia.org',
          getCategories: true,
      } as any);

      const cacheDir = `cac/dumps-${Date.now()}/`;
      await mkdirPromise(cacheDir);
      s3 = new S3(`${s3UrlObj.protocol}//${s3UrlObj.host}/`, {
          bucketName: s3UrlObj.query.bucketName,
          keyId: s3UrlObj.query.keyId,
          secretAccessKey: s3UrlObj.query.secretAccessKey,
      });
      downloader = new Downloader({ mw, uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: false, optimisationCacheUrl: 'random-string' , s3});

      await s3.initialise();
    });

    test('Etag Not Present', async() => {
      const etagNotPresent = await downloader.downloadContent(`https://en.wikipedia.org/w/extensions/WikimediaBadges/resources/images/badge-silver-star.png?70a8c`);
      expect(etagNotPresent.responseHeaders.etag).toBeUndefined();
    });

    test('Delete image from S3', async() => {
      const testImage = 'https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.png';

      // Strip http(s) from url
      const httpOrHttpsRemoved = stripHttpFromUrl(testImage);
      expect(httpOrHttpsRemoved).toBeDefined();

      // Delete the image already present in S3
      await s3.deleteBlob({ Bucket: s3UrlObj.query.bucketName, Key: httpOrHttpsRemoved });

      // Check if image exists after deleting from S3
      const imageNotExists = await s3.downloadBlob(httpOrHttpsRemoved);
      expect(imageNotExists).toBeNull();
    });

    test('Delete image from S3', async() => {
      const randomImageUrl = async () => {
        const url = await getRandomImageUrl();
        return isImageUrl(url) ? url : randomImageUrl(); // recursion to get URL with image in needed format
      }

      // Check Etag Flow
      const randomImage = await randomImageUrl();
      const imagePath = stripHttpFromUrl(randomImage);
      await s3.deleteBlob({ Bucket: s3UrlObj.query.bucketName, Key: imagePath });

      // Upload the image in S3
      await downloader.downloadContent(randomImage);

      // downloadContent() is async so there is no way figure outs when the download completes, thats why setTimeout() is used
      await setTimeout(5000);

      // Get the online data of Image from Mediawiki
      const resp = await Axios(randomImage);

      // Download the uploaded image from S3 and check the Etags
      const imageContent =  await s3.downloadBlob(imagePath);
      expect(downloader.removeEtagWeakPrefix(`${resp.headers.etag}`)).toEqual(imageContent.Metadata.etag);

      // Upload Image with wrong Etag
      await s3.uploadBlob(imagePath, resp.data, 'random-string', '1');

      // Download again to check the Etag has been refreshed properly
      const updatedImage = await s3.downloadBlob(imagePath);
      expect(updatedImage.Metadata.etag).toEqual(downloader.removeEtagWeakPrefix(`${resp.headers.etag}`));
      // Remove Image after test
      await s3.deleteBlob({ Bucket: s3UrlObj.query.bucketName, Key: imagePath });
    });
  });

  async function getRandomImageUrl(): Promise<string> {
      const resp = await Axios('https://commons.wikimedia.org/w/api.php?action=query&generator=random&grnnamespace=6&prop=imageinfo&iiprop=url&formatversion=2&iiurlwidth=100&format=json');
      return resp.data.query.pages[0].imageinfo[0].url;
  }

});