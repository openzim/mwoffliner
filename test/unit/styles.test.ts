// tslint:disable-next-line: no-reference
///<reference path="../../src/types.d.ts" />

// tslint:disable-next-line: no-var-requires
require('dotenv').config();

import test from 'blue-tape';
import domino from 'domino';

import { setupScrapeClasses } from 'test/util';
import { populateArticleDetail, articleDetailXId, populateRedirects, redirectsXId, populateFilesToDownload, filesToDownloadXPath } from 'src/stores';
import Redis from '../../src/redis';
import { config } from '../../src/config';
import { getAndProcessStylesheets } from 'src/util';
import Axios from 'axios';

const redis = new Redis({ redis: process.env.REDIS }, config);
populateArticleDetail(redis.redisClient);
populateRedirects(redis.redisClient);
populateFilesToDownload(redis.redisClient);

test('Stylesheet downloading', async (t) => {
    const { downloader, mw, dump } = await setupScrapeClasses(); // en wikipedia

    const articlesDetail = await downloader.getArticleDetailsIds(['London']);
    await articleDetailXId.flush();
    await articleDetailXId.setMany(articlesDetail);

    const offlineCSSUrl = `https://en.wikipedia.org/w/index.php?title=Mediawiki:offline.css&action=raw`;
    const siteStylesUrl = `http://en.wikipedia.org/w/load.php?lang=en&modules=site.styles&only=styles&skin=vector`;

    const { data: offlineCSSContent } = await Axios.get(offlineCSSUrl);
    const { data: siteStylesContent } = await Axios.get(siteStylesUrl);

    const { finalCss } = await getAndProcessStylesheets(downloader, [offlineCSSUrl, siteStylesUrl]);

    t.assert(finalCss.includes(offlineCSSUrl), `Contains offline CSS url`);
    t.assert(finalCss.includes(offlineCSSContent), `Contains offline CSS content`);

    t.assert(finalCss.includes(siteStylesUrl), `Contains site CSS url`);
    t.assert(!finalCss.includes(siteStylesContent), `Contains re-written site CSS content`);

    articleDetailXId.flush();
    redirectsXId.flush();
    filesToDownloadXPath.flush();
    redis.redisClient.quit();
});
