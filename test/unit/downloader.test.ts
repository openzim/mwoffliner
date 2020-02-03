import './bootstrap.test.ts';
import test from 'blue-tape';
import tapePromise from 'tape-promise';
import Downloader from 'src/Downloader';
import MediaWiki from 'src/MediaWiki';
import Axios from 'axios';
import { mkdirPromise, mwRetToArticleDetail } from 'src/util';
import S3 from '../../src/util/s3';
import rimraf from 'rimraf';
import { Dump } from 'src/Dump';
import { articleDetailXId } from 'src/stores';
import logger from 'src/Logger';
import 'dotenv/config';

test('Downloader class', async (t) => {
    const mw = new MediaWiki({
        base: 'https://en.wikipedia.org',
        getCategories: true,
    } as any);

    const cacheDir = `cac/dumps-${Date.now()}/`;
    await mkdirPromise(cacheDir);
    const downloader = new Downloader({ mw, uaString: '', speed: 1, reqTimeout: 1000 * 60, useDownloadCache: true, downloadCacheDirectory: cacheDir, noLocalParserFallback: false, optimisationCacheUrl: '' });

    await downloader.checkCapabilities();

    // const remoteMcsUrl = downloader.mcsUrl;
    // const remoteParsoidUrl = downloader.parsoidFallbackUrl;

    // const mcsHandle = await downloader.initLocalMcs();

    // t.notEqual(remoteMcsUrl, downloader.mcsUrl, 'Initializing local MCS changes mcsUrl');
    // t.notEqual(remoteParsoidUrl, downloader.parsoidFallbackUrl, 'Initializing local Parsoid changes parsoidFallbackUrl');

    const queryRet = await downloader.query(`?action=query&meta=siteinfo&siprop=statistics&format=json`);
    t.ok(!!queryRet, 'downloader.query returns valid JSON');

    const JSONRes = await downloader.getJSON(`https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json`);
    t.ok(!!JSONRes, 'downloader.getJSON returns valid JSON');

    const urlExists = await downloader.canGetUrl(`https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json`);
    t.ok(urlExists, 'downloader.canGetUrl returns valid answer (positive)');

    const urlNotExists = await downloader.canGetUrl(`https://en.wikipedia.org/w/thisisa404`);
    t.ok(!urlNotExists, 'downloader.canGetUrl returns valid answer (negative)');

    try {
        await downloader.getJSON(`https://en.wikipedia.org/w/thisisa404`);
    } catch (err) {
        t.ok(true, 'getJSON throws on non-existant url');
        t.equal(err.response.status, 404, 'getJSON response status for non-existant url is 404');
    }

    const contentRes = await downloader.downloadContent(`https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/London_Montage_L.jpg/275px-London_Montage_L.jpg`);
    t.ok(!!contentRes.responseHeaders, 'downloader.downloadContent returns');

    try {
        await downloader.downloadContent(`https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/thisdoesnotexist.jpg`);
    } catch (err) {
        t.ok(true, 'downloader.downloadContent throws on non-existant url');
        t.equal(err.response.status, 404, 'downloadContent response status for non-existant url is 404');
    }

    const _articleDetailsRet = await downloader.getArticleDetailsIds(['London', 'United_Kingdom', 'Paris', 'Zurich', 'THISARTICLEDOESNTEXIST', 'Category:Container_categories']);
    const articleDetailsRet = mwRetToArticleDetail(downloader, _articleDetailsRet);
    articleDetailXId.setMany(articleDetailsRet);
    const { London, Paris, Zurich, United_Kingdom, THISARTICLEDOESNTEXIST } = articleDetailsRet;
    t.ok(!!London, 'getArticleDetailsIds Scraped "London" successfully');
    t.ok(!!United_Kingdom, 'getArticleDetailsIds Scraped "United_Kingdom" successfully');
    t.ok(!!Paris, 'getArticleDetailsIds Scraped "Paris" successfully');
    t.ok(!!Zurich, 'getArticleDetailsIds Scraped "Zurich" successfully');
    t.ok(typeof (THISARTICLEDOESNTEXIST as any).missing === 'string', 'getArticleDetailsIds Didn\'t scrape "THISARTICLEDOESNTEXIST" successfully');

    const { gapContinue, articleDetails } = await downloader.getArticleDetailsNS(0);
    t.ok(!!gapContinue, 'NS query returns a gapContinue');
    t.ok(Object.keys(articleDetails).length > 10, 'NS query returns multiple articles');
    const secondNsRet = await downloader.getArticleDetailsNS(0, gapContinue);
    t.ok(!!secondNsRet.gapContinue, 'Second NS query returns a gapContinue');

    try {
        await downloader.downloadContent('');
    } catch (err) {
        t.ok(true, 'downloadContent throws when empty string is passed');
    }

    const { data: LondonDetail } = await Axios.get(`${downloader.mcsUrl}London`);
    const [imgToGet] = Object.values(LondonDetail.lead.image.urls);

    const LondonImage = await downloader.downloadContent(imgToGet);
    t.ok(!!LondonImage.responseHeaders['content-type'].includes('image/'), 'downloadContent successfully downloaded an image');

    const mwMetadata = await mw.getMwMetaData(downloader);
    const dump = new Dump('', {} as any, mwMetadata);

    const LondonArticle = await downloader.getArticle('London', dump);
    t.equal(LondonArticle.length, 1, 'getArticle of "London" returns one article');

    const PaginatedArticle = await downloader.getArticle('Category:Container_categories', dump);
    t.ok(PaginatedArticle.length > 100, 'Categories with many subCategories are paginated');

    rimraf.sync(cacheDir);

    const isPngFile = await downloader.isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.svg.png');
    t.assert(isPngFile, 'Checked Image type: png');

    const isJpgFile = await downloader.isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.JPG');
    t.assert(isJpgFile, 'Checked Image type: jpg');

    const isSvgFile = await downloader.isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.svg');
    t.assert(isSvgFile, 'Checked Image type: svg');

    const isJpegFile = await downloader.isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.JPEG');
    t.assert(isJpegFile, 'Checked Image type: jpeg');

    const isgifFile = await downloader.isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.gif');
    t.assert(isgifFile, 'Checked Image type: gif');

    const isnotImage = await downloader.isImageUrl('https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json');
    t.assert(!isnotImage, 'Url is not image type');

    // TODO: find a way to get service-runner to stop properly
    // await mcsHandle.stop();
});

const _test = tapePromise(test);

_test('Downloader class with optimisation', async (t) => {
    const mw = new MediaWiki({
        base: 'https://en.wikipedia.org',
        getCategories: true,
    } as any);

    const cacheDir = `cac/dumps-${Date.now()}/`;
    await mkdirPromise(cacheDir);
    const downloader = new Downloader({ mw, uaString: '', speed: 1, reqTimeout: 1000 * 60, useDownloadCache: true, downloadCacheDirectory: cacheDir, noLocalParserFallback: false, optimisationCacheUrl: 's3.us-west-1.wasabisys.com/?bucketName=mwoffliner?keyId=SJGJT2C2H0WM6S1744W1?secretAccessKey=oNiEt0YfmZ4IShJBlU7XJu0EmWXtcDwdoKsmQZA' });

    await S3.initialiseS3Config(process.env.BASE_URL_TEST, {
        bucketName: process.env.BUCKET_NAME_TEST,
        keyId: process.env.KEY_ID_TEST,
        secretAccessKey: process.env.SECRET_ACCESS_KEY_TEST }
    );

    const testImage = 'https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.png';
    // Test for image where etag is not present
    const etagNotPresent = await downloader.downloadContent(`https://bm.wikipedia.org/w/skins/Vector/images/unwatch-icon-hl.svg?71c12`);
    t.equals(etagNotPresent.responseHeaders.etag, undefined , 'Etag Not Present');

    // FLOW OF IMAGE CACHING
    // Delete the image already present in s3
    await S3.deleteImage({ Bucket: process.env.BUCKET_NAME_TEST, Key: 'bmwiki-2x.png' });
    t.ok(true, 'Image deleted from s3');

    // Check if image exists after deleting from s3
    const imageNotExists = S3.existsInS3(testImage);
    t.rejects(imageNotExists, 'Image not exists in s3 after deleting');
    // Uploads the image to s3
    await downloader.downloadContent(testImage);
    setTimeout(async function() {
        // Check if image exists after uploading
        const imageExist = await S3.existsInS3(testImage);
        t.assert(imageExist, 'Image exists in s3 after uploading');
    }, 7000);
});
