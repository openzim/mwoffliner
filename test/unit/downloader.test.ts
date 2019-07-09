import './bootstrap.test';
import test from 'blue-tape';
import Downloader from 'src/Downloader';
import MediaWiki from 'src/MediaWiki';
import Axios from 'axios';
import { mkdirPromise } from 'src/util';
import rimraf from 'rimraf';
import { Dump } from 'src/Dump';
import { articleDetailXId } from 'src/stores';

test('Downloader class', async (t) => {
    const mw = new MediaWiki({
        base: 'https://en.wikipedia.org',
        getCategories: true,
    } as any);

    const cacheDir = `cac/dumps-${Date.now()}/`;
    await mkdirPromise(cacheDir);
    const downloader = new Downloader({ mw, uaString: '', speed: 1, reqTimeout: 1000 * 60, useCache: true, cacheDirectory: cacheDir, noLocalParserFallback: false });

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

    const articleDetailsRet = await downloader.getArticleDetailsIds(['London', 'United_Kingdom', 'Paris', 'Zurich', 'THISARTICLEDOESNTEXIST', 'Category:Container_categories']);
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

    // TODO: find a way to get service-runner to stop properly
    // await mcsHandle.stop();
});
