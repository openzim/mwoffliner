// tslint:disable-next-line: no-reference
///<reference path="../../src/types.d.ts" />

// tslint:disable-next-line: no-var-requires
require('dotenv').config();

import test from 'blue-tape';
import domino from 'domino';

import { rewriteUrl } from 'src/util/rewriteUrls';
import { makeLink, setupScrapeClasses } from 'test/util';
import { populateArticleDetail, articleDetailXId, populateRedirects, redirectsXId } from 'src/stores';
import Redis from 'src/redis';
import { config } from 'src/config';

const redis = new Redis({ redis: process.env.REDIS }, config);
populateArticleDetail(redis.redisClient);
populateRedirects(redis.redisClient);

test('Url re-writing works with simple parent articleId', async (t) => {
    const { downloader, mw, dump } = await setupScrapeClasses(); // en wikipedia

    const articlesDetail = await downloader.getArticleDetailsIds(['London', 'British_Museum', 'Farnborough/Aldershot_Built-up_Area']);
    await articleDetailXId.flush();
    await articleDetailXId.setMany(articlesDetail);

    const parentArticleId = 'London';

    const $doc = domino.createDocument();
    const $geo = makeLink($doc, 'geo:37.786971,-122.399677', 'mw:ExtLink', 'some geo link');
    const $geoHack = makeLink($doc, '//tools.wmflabs.org/geohack/geohack.php?pagename=London&params=51_30_26_N_0_7_39_W_region:GB_type:city(8825000)', 'mw:ExtLink', '51°30′26″N 0°7′39″W');
    const $extHttp = makeLink($doc, 'http://google.com', 'mw:ExtLink', 'Google\'s Homepage (HTTP)');
    const $extHttps = makeLink($doc, 'https://google.com', 'mw:ExtLink', 'Google\'s Homepage (HTTPS)');
    const $wikiLink = makeLink($doc, '/wiki/British_Museum', '', 'British Museum');
    const $wikiLinkWithSlash = makeLink($doc, '/wiki/Farnborough/Aldershot_Built-up_Area', '', 'Farnborough/Aldershot Built-up Area');
    const $nonScrapedWikiLink = makeLink($doc, '/wiki/this_page_does_not_exist', '', 'fake link');

    await rewriteUrl(parentArticleId, mw, dump, $geo);
    t.assert($geo.nodeName === 'A', 'Geo is still a link');
    t.equal($geo.href, 'geo://37.786971,-122.399677', 'Geo HREF is correct'); // seems to be a bug in Domino which forces ://

    await rewriteUrl(parentArticleId, mw, dump, $geoHack);
    t.assert($geoHack.nodeName === 'A', 'GeoHack is still a link');
    t.equal($geoHack.href, 'geo://51.507222222222225,-0.1275', 'GeoHack HREF is correct');

    await rewriteUrl(parentArticleId, mw, dump, $extHttp);
    t.assert($extHttp.nodeName === 'A', 'extHttp is still a link');
    t.equal($extHttp.href, 'http://google.com', 'extHttp HREF is correct');

    await rewriteUrl(parentArticleId, mw, dump, $extHttps);
    t.assert($extHttps.nodeName === 'A', 'extHttps is still a link');
    t.equal($extHttps.href, 'https://google.com', 'extHttps HREF is correct');

    await rewriteUrl(parentArticleId, mw, dump, $wikiLink);
    t.assert($wikiLink.nodeName === 'A', 'wikiLink is still a link');
    t.equal($wikiLink.href, '/British_Museum', 'wikiLink HREF is correct');

    await rewriteUrl(parentArticleId, mw, dump, $wikiLinkWithSlash);
    t.assert($wikiLinkWithSlash.nodeName === 'A', 'wikiLinkWithSlash is still a link');
    t.equal($wikiLinkWithSlash.href, '/Farnborough%2FAldershot_Built-up_Area', 'wikiLinkWithSlash HREF is correct');

    await rewriteUrl(parentArticleId, mw, dump, $nonScrapedWikiLink);
    t.assert(!$nonScrapedWikiLink.parentElement, 'nonScrapedWikiLink has been deleted');

    articleDetailXId.flush();
    redirectsXId.flush();
    redis.redisClient.quit();
});
