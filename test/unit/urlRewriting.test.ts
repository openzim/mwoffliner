import './bootstrap.test';

import test from 'blue-tape';
import domino from 'domino';

import { rewriteUrl } from '../../src/util/rewriteUrls';
import { makeLink, setupScrapeClasses } from 'test/util';
import { articleDetailXId } from '../../src/stores';
import { getArticleIds } from 'src/util/redirects';
import { saveArticles, isMirrored } from 'src/util/saveArticles';
import { ZimArticle } from '@openzim/libzim';
import { mwRetToArticleDetail } from 'src/util';

test('Url re-writing', async (t) => {
    const { downloader, mw, dump } = await setupScrapeClasses(); // en wikipedia

    const _articlesDetail = await downloader.getArticleDetailsIds(['London', 'British_Museum', 'Farnborough/Aldershot_Built-up_Area']);
    const articlesDetail = mwRetToArticleDetail(downloader, _articlesDetail);
    await articleDetailXId.flush();
    await articleDetailXId.setMany(articlesDetail);

    const parentArticleId = 'London';
    const complexParentArticleId = 'London/City_Example';

    const $doc = domino.createDocument();
    const $geo = makeLink($doc, 'geo:37.786971,-122.399677', 'mw:ExtLink', 'some geo link');
    const $geoHack = makeLink($doc, '//tools.wmflabs.org/geohack/geohack.php?pagename=London&params=51_30_26_N_0_7_39_W_region:GB_type:city(8825000)', 'mw:ExtLink', '51°30′26″N 0°7′39″W');
    const $extHttp = makeLink($doc, 'http://google.com', 'mw:ExtLink', 'Google\'s Homepage (HTTP)');
    const $extHttps = makeLink($doc, 'https://google.com', 'mw:ExtLink', 'Google\'s Homepage (HTTPS)');
    const $extHttpsNoRel = makeLink($doc, 'https://google.com', '', 'Google\'s Homepage (HTTPS)');
    const $extNoProtocol = makeLink($doc, '//google.com', '', 'Google\'s Homepage (no protocol)');
    const $wikiLink = makeLink($doc, '/wiki/British_Museum', '', 'British Museum');
    const $wikiLink2 = makeLink($doc, '/wiki/British_Museum', '', 'British Museum');
    const $wikiLinkWithSlash = makeLink($doc, '/wiki/Farnborough/Aldershot_Built-up_Area', '', 'Farnborough/Aldershot Built-up Area');
    const $nonScrapedWikiLink = makeLink($doc, '/wiki/this_page_does_not_exist', '', 'fake link');
    const $specialMap = makeLink($doc, '/wiki/Special:Map/9/51.51/-0.08/en', '', 'Interactive map outlining London');
    const $hashLink = makeLink($doc, '#cite_note-LAS-150', '', 'The London Air Ambulance');
    const $resourceLink = makeLink($doc, '//upload.wikimedia.org/wikipedia/commons/c/c6/De-Z%C3%BCrich.ogg', '', 'De-Z%C3%BCrich.ogg', 'Zurich', { resource: './Media:De-Zürich.ogg' });

    await rewriteUrl(complexParentArticleId, mw, dump, $geo);
    t.assert($geo.nodeName === 'A', 'Geo is still a link');
    t.equal($geo.getAttribute('href'), 'geo:37.786971,-122.399677', 'Geo HREF is correct');

    await rewriteUrl(complexParentArticleId, mw, dump, $geoHack);
    t.assert($geoHack.nodeName === 'A', 'GeoHack is still a link');
    t.equal($geoHack.getAttribute('href'), 'geo:51.507222222222225,-0.1275', 'GeoHack HREF is correct');

    await rewriteUrl(complexParentArticleId, mw, dump, $extHttp);
    t.assert($extHttp.nodeName === 'A', 'extHttp is still a link');
    t.equal($extHttp.getAttribute('href'), 'http://google.com', 'extHttp HREF is correct');

    await rewriteUrl(complexParentArticleId, mw, dump, $extHttps);
    t.assert($extHttps.nodeName === 'A', 'extHttps is still a link');
    t.equal($extHttps.getAttribute('href'), 'https://google.com', 'extHttps HREF is correct');

    await rewriteUrl(complexParentArticleId, mw, dump, $extNoProtocol);
    t.assert($extNoProtocol.nodeName === 'A', 'extNoProtocol is still a link');
    t.equal($extNoProtocol.getAttribute('href'), 'https://google.com', '$extNoProtocol HREF has HTTPS Protocol');

    await rewriteUrl(complexParentArticleId, mw, dump, $extHttpsNoRel);
    t.assert($extHttpsNoRel.nodeName === 'A', 'extHttpsNoRel is still a link');
    t.equal($extHttpsNoRel.getAttribute('href'), 'https://google.com', 'extHttpsNoRel HREF is correct');

    await rewriteUrl(parentArticleId, mw, dump, $wikiLink);
    t.assert($wikiLink.nodeName === 'A', 'wikiLink is still a link with simple parent id');
    t.equal($wikiLink.getAttribute('href'), 'British_Museum', 'wikiLink HREF is correct with simple parent id');

    await rewriteUrl(complexParentArticleId, mw, dump, $wikiLink2);
    t.assert($wikiLink2.nodeName === 'A', 'wikiLink is still a link with complex parent id');
    t.equal($wikiLink2.getAttribute('href'), '../../A/British_Museum', 'wikiLink HREF is correct with complex parent id');

    await rewriteUrl(complexParentArticleId, mw, dump, $wikiLinkWithSlash);
    t.assert($wikiLinkWithSlash.nodeName === 'A', 'wikiLinkWithSlash is still a link');
    t.equal($wikiLinkWithSlash.getAttribute('href'), '../../A/Farnborough/Aldershot_Built-up_Area', 'wikiLinkWithSlash HREF is correct');

    await rewriteUrl(complexParentArticleId, mw, dump, $specialMap);
    t.assert($specialMap.nodeName === 'A', 'specialMap is still a link');
    t.equal($specialMap.getAttribute('href'), 'geo:51.51,-0.08', 'specialMap HREF is correct');

    await rewriteUrl(complexParentArticleId, mw, dump, $hashLink);
    t.assert($hashLink.nodeName === 'A', 'hashLink is still a link');
    t.equal($hashLink.getAttribute('href'), '#cite_note-LAS-150', 'hashLink HREF is correct');

    await rewriteUrl(complexParentArticleId, mw, dump, $nonScrapedWikiLink);
    t.assert(!$nonScrapedWikiLink.parentElement, 'nonScrapedWikiLink has been deleted');

    await rewriteUrl(complexParentArticleId, mw, dump, $resourceLink);
    t.assert($resourceLink.nodeName === 'A', 'resourceLink is still a link');
    t.equal($resourceLink.getAttribute('href'), '../../I/m/De-Z%C3%BCrich.ogg', 'resourceLink has been re-written');

});

test('e2e url rewriting', async (t) => {
    await articleDetailXId.flush();
    const { downloader, mw, dump } = await setupScrapeClasses(); // en wikipedia

    await getArticleIds(downloader, mw, '', ['London', 'British_Museum', 'Natural_History_Museum,_London', 'Farnborough/Aldershot_Built-up_Area']);

    let LondonArticle: typeof ZimArticle;

    await saveArticles({
        addArticle(article: typeof ZimArticle) {
            if (article.title === 'London') {
                LondonArticle = article;
            }
            return Promise.resolve();
        },
    } as any,
        downloader,
        mw,
        dump,
    );

    const html = LondonArticle.bufferData.toString();
    const doc = domino.createDocument(html);

    const relevantAs = Array.from(doc.querySelectorAll('a')).filter((a) => !a.hash && !a.className.includes('external') && !a.host && a.getAttribute('href'));

    const linkedArticleIds = relevantAs.map((a) => decodeURIComponent(a.getAttribute('href')));
    for (const aId of linkedArticleIds) {
        const article = await isMirrored(aId);
        t.assert(!!article, `Article [${aId}] exists`);
    }
});
