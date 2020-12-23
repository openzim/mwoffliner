import './bootstrap.test.ts';
import test from 'blue-tape';
import tapePromise from 'tape-promise';
import Downloader from 'src/Downloader';
import MediaWiki from 'src/MediaWiki';
import Axios from 'axios';
import { mkdirPromise, mwRetToArticleDetail, stripHttpFromUrl, isImageUrl } from 'src/util';
import S3 from 'src/S3';
import rimraf from 'rimraf';
import { Dump } from 'src/Dump';
import { articleDetailXId } from 'src/stores';
import logger from 'src/Logger';
import 'dotenv/config';
import FileType from 'file-type'

test('Downloader class', async (t) => {
    const mw = new MediaWiki({
        base: 'https://en.wikipedia.org',
        getCategories: true,
    } as any);

    const cacheDir = `cac/dumps-${Date.now()}/`;
    await mkdirPromise(cacheDir);
    const downloader = new Downloader({ mw, uaString: '', speed: 1, reqTimeout: 1000 * 60, noLocalParserFallback: false, forceLocalParser: false, webp: true, optimisationCacheUrl: '' });

    await mw.getMwMetaData(downloader);
    await downloader.checkCapabilities();
    await downloader.setBaseUrls();

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

    const {content} = await downloader.downloadContent(`https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/LOGO_HAEMMERLIN.jpg/550px-LOGO_HAEMMERLIN.jpg`);
     t.equal((await FileType.fromBuffer(Buffer.from(content))).mime, 'image/webp', 'Webp compression wroking for cmyk color-space images')

    try {
        await downloader.downloadContent(`https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/thisdoesnotexist.jpg`);
    } catch (err) {
        t.ok(true, 'downloader.downloadContent throws on non-existant url');
        t.equal(err.response.status, 404, 'downloadContent response status for non-existant url is 404');
    }

    const _articleDetailsRet = await downloader.getArticleDetailsIds(['London', 'United_Kingdom', 'Paris', 'Zürich', 'THISARTICLEDOESNTEXIST', 'Category:Container_categories']);
    const articleDetailsRet = mwRetToArticleDetail(_articleDetailsRet);
    articleDetailXId.setMany(articleDetailsRet);
    const { London, Paris, Zürich, United_Kingdom, THISARTICLEDOESNTEXIST } = articleDetailsRet;
    t.ok(!!London, 'getArticleDetailsIds Scraped "London" successfully');
    t.ok(!!United_Kingdom, 'getArticleDetailsIds Scraped "United_Kingdom" successfully');
    t.ok(!!Paris, 'getArticleDetailsIds Scraped "Paris" successfully');
    t.ok(!!Zürich, 'getArticleDetailsIds Scraped "Zürich" successfully');
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

    const { data: LondonDetail } = await Axios.get(`https://en.wikipedia.org/api/rest_v1/page/mobile-sections/London`);
    const [imgToGet] = Object.values(LondonDetail.lead.image.urls);

    const LondonImage = await downloader.downloadContent(imgToGet as string);
    t.ok(!!LondonImage.responseHeaders['content-type'].includes('image/'), 'downloadContent successfully downloaded an image');

    const mwMetadata = await mw.getMwMetaData(downloader);

    const dump = new Dump('', {} as any, mwMetadata);

    const LondonArticle = await downloader.getArticle('London', dump);
    t.equal(LondonArticle.length, 1, 'getArticle of "London" returns one article');

    const PaginatedArticle = await downloader.getArticle('Category:Container_categories', dump);
    t.ok(PaginatedArticle.length > 100, 'Categories with many subCategories are paginated');

    try {
        await downloader.getArticle('NeverExistingArticle', dump);
    } catch (err) {
        t.ok(true, 'downloader.downloadContent throws on non-existent article id');
        t.equal(err.response.status, 404, 'getArticle response status for non-existent article id is 404');
    }

    rimraf.sync(cacheDir);

    const isPngFile = isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.svg.png');
    t.assert(isPngFile, 'Checked Image type: png');

    const isJpgFile = isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.JPG');
    t.assert(isJpgFile, 'Checked Image type: jpg');

    const isSvgFile = isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.svg');
    t.assert(isSvgFile, 'Checked Image type: svg');

    const isJpegFile = isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.JPEG');
    t.assert(isJpegFile, 'Checked Image type: jpeg');

    const isgifFile = isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.gif');
    t.assert(isgifFile, 'Checked Image type: gif');

    const isgifFileWithArgs = isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.gif?foo=bar');
    t.assert(isgifFileWithArgs, 'Checked Image URL with arguments');

    const isnotImage = isImageUrl('https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json');
    t.assert(!isnotImage, 'Url is not image type');

    const isEmptyString = isImageUrl('');
    t.assert(!isEmptyString, 'Url is empty string');

    const imageHasNoExtension = isImageUrl('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x');
    t.assert(!imageHasNoExtension, 'Image Url has no extension');

    const extensionIsUndefined =  isImageUrl('https://bm.wikipedia.org/static/images/project-logos/undefined');
    t.assert(!extensionIsUndefined, 'Image Url extension is undefined');
    // TODO: find a way to get service-runner to stop properly
    // await mcsHandle.stop();
});

const _test = tapePromise(test);

_test('Downloader class with optimisation', async (t) => {
    if (!process.env.BUCKET_NAME_TEST) {
        logger.log('Skip S3 tests in Downloader class');
        return;
    }

    const mw = new MediaWiki({
        base: 'https://en.wikipedia.org',
        getCategories: true,
    } as any);

    const cacheDir = `cac/dumps-${Date.now()}/`;
    await mkdirPromise(cacheDir);
    const s3 = new S3(process.env.BASE_URL_TEST, {
        bucketName: process.env.BUCKET_NAME_TEST,
        keyId: process.env.KEY_ID_TEST,
        secretAccessKey: process.env.SECRET_ACCESS_KEY_TEST,
    });
    const downloader = new Downloader({ mw, uaString: '', speed: 1, reqTimeout: 1000 * 60, noLocalParserFallback: false, forceLocalParser: false, webp: false, optimisationCacheUrl: 'random-string' , s3});

    await s3.initialise();

    const testImage = 'https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.png';
    // Test for image where etag is not present
    const etagNotPresent = await downloader.downloadContent(`https://en.wikipedia.org/w/extensions/WikimediaBadges/resources/images/badge-silver-star.png?70a8c`);
    t.equals(etagNotPresent.responseHeaders.etag, undefined , 'Etag Not Present');

    // Strip http(s) from url
    const httpOrHttpsRemoved = stripHttpFromUrl(testImage);
    t.assert(httpOrHttpsRemoved, 'http removed from url');

    // Delete the image already present in S3
    await s3.deleteBlob({ Bucket: process.env.BUCKET_NAME_TEST, Key: httpOrHttpsRemoved });
    t.ok(true, 'Image deleted from S3');

    // Check if image exists after deleting from S3
    const imageNotExists = await s3.downloadBlob(httpOrHttpsRemoved);
    t.equals(imageNotExists, undefined, 'Image not exists in S3 after deleting');

    // Check Etag Flow
    const randomImage = await getRandomImageUrl();
    const imagePath = stripHttpFromUrl(randomImage);
    await s3.deleteBlob({ Bucket: process.env.BUCKET_NAME_TEST, Key: imagePath });

    // Upload the image in S3
    await downloader.downloadContent(randomImage);

    // downloadContent() is async so there is no way figure outs when the download completes, thats why setTimeout() is used
    setTimeout(async function(){
        // Get the online data of Image from Mediawiki
        const resp = await Axios(randomImage);

        // Download the uploaded image from S3 and check the Etags
        const imageContent =  await s3.downloadBlob(imagePath);
        t.equal(downloader.removeEtagWeakPrefix(resp.headers.etag), imageContent.Metadata.etag, 'Etag Matched from online Mediawiki and S3');

        // Upload Image with wrong Etag
        await s3.uploadBlob(imagePath, resp.data, 'random-string', '1');

        // Download again to check the Etag has been refreshed properly
        const updatedImage = await s3.downloadBlob(imagePath);
        t.equal(updatedImage.Metadata.etag,  downloader.removeEtagWeakPrefix(resp.headers.etag), 'Image refreshed with proper Etag');
    }, 5000)
});

async function getRandomImageUrl(): Promise<string> {
    const resp = await Axios('https://commons.wikimedia.org/w/api.php?action=query&generator=random&grnnamespace=6&prop=imageinfo&iiprop=url&formatversion=2&iiurlwidth=100&format=json');
    return resp.data.query.pages[0].imageinfo[0].url;
}
