// tslint:disable-next-line: no-reference
///<reference path="../../src/types.d.ts" />

// tslint:disable-next-line: no-var-requires
require('dotenv').config();

import test from 'blue-tape';

import { populateArticleDetail, articleDetailXId, populateRedirects, redirectsXId, populateFilesToDownload, filesToDownloadXPath, populateRequestCache, requestCacheXUrl } from 'src/stores';
import Redis from '../../src/redis';
import { config } from '../../src/config';
import Downloader from 'src/Downloader';
import MediaWiki from 'src/MediaWiki';
import Axios from 'axios';
import { mkdirPromise } from 'src/util';
import rimraf from 'rimraf';
import { Dump } from 'src/Dump';

const redis = new Redis({ redis: process.env.REDIS }, config);
populateArticleDetail(redis.redisClient);
populateRedirects(redis.redisClient);
populateFilesToDownload(redis.redisClient);
populateRequestCache(redis.redisClient);

test('Downloader class', async (t) => {
    const mw = new MediaWiki({
        base: 'https://en.wikipedia.org',
        getCategories: true,
    } as any);

    const cacheDir = `cac/dumps-${Date.now()}/`;
    await mkdirPromise(cacheDir);
    const downloader = new Downloader(mw, '', 1, 1000 * 60, true, cacheDir);

    // const remoteMcsUrl = downloader.mcsUrl;
    // const remoteParsoidUrl = downloader.parsoidFallbackUrl;

    // const mcsHandle = await downloader.initLocalMcs();

    // t.notEqual(remoteMcsUrl, downloader.mcsUrl, 'Initializing local MCS changes mcsUrl');
    // t.notEqual(remoteParsoidUrl, downloader.parsoidFallbackUrl, 'Initializing local Parsoid changes parsoidFallbackUrl');

    const queryRet = await downloader.query(`?action=query&meta=siteinfo&siprop=statistics&format=json`);
    t.ok(!!queryRet, 'downloader.query returns valid JSON');

    const articleDetailsRet = await downloader.getArticleDetailsIds(['London', 'Paris', 'Zurich', 'THISARTICLEDOESNTEXIST', 'Category:Container_categories']);
    articleDetailXId.setMany(articleDetailsRet);
    const { London, Paris, Zurich, THISARTICLEDOESNTEXIST } = articleDetailsRet;
    t.ok(!!London, 'getArticleDetailsIds Scraped "London" successfully');
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

    articleDetailXId.flush();
    redirectsXId.flush();
    filesToDownloadXPath.flush();
    requestCacheXUrl.flush();
    redis.redisClient.quit();
    rimraf.sync(cacheDir);

    // TODO: find a way to get service-runner to stop properly
    // await mcsHandle.stop();
});
