// tslint:disable-next-line: no-reference
///<reference path="../../src/types.d.ts" />

// tslint:disable-next-line: no-var-requires
require('dotenv').config();

import test from 'blue-tape';
import domino from 'domino';

import { setupScrapeClasses } from 'test/util';
import { populateArticleDetail, articleDetailXId, populateRedirects, redirectsXId, populateFilesToDownload, filesToDownloadXPath } from 'src/stores';
import Redis from 'src/redis';
import { config } from 'src/config';
import { saveArticles } from 'src/util/saveArticles';
import { ZimArticle } from '@openzim/libzim';

const redis = new Redis({ redis: process.env.REDIS }, config);
populateArticleDetail(redis.redisClient);
populateRedirects(redis.redisClient);
populateFilesToDownload(redis.redisClient);

test('Article html processing', async (t) => {
    const { downloader, mw, dump } = await setupScrapeClasses(); // en wikipedia

    const articlesDetail = await downloader.getArticleDetailsIds(['London']);
    await articleDetailXId.flush();
    await articleDetailXId.setMany(articlesDetail);

    const [{ html }] = await downloader.getArticle('London', dump);

    let addedArticle: ZimArticle;

    // TODO: use proper spied (like sinon.js)
    await saveArticles({
        addArticle(article: ZimArticle) {
            if (article.mimeType === 'text/html') {
                addedArticle = article;
            }
            return Promise.resolve();
        },
    } as any,
        downloader,
        mw,
        dump,
    );

    const articleDoc = domino.createDocument(addedArticle.bufferData.toString());

    t.assert(articleDoc.querySelector('meta[name="geo.position"]'), 'Geo Position meta exists');
    t.equal(articleDoc.querySelector('meta[name="geo.position"]').getAttribute('content'), '51.50722222;-0.1275', 'Geo Position data is correct');

    articleDetailXId.flush();
    redirectsXId.flush();
    filesToDownloadXPath.flush();
    redis.redisClient.quit();
});
