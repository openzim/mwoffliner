import './bootstrap.test';
import test from 'blue-tape';

import { setupScrapeClasses } from 'test/util';
import { articleDetailXId } from 'src/stores';
import { getAndProcessStylesheets, mwRetToArticleDetail } from 'src/util';
import Axios from 'axios';
import logger from '../../src/Logger';

test('Stylesheet downloading', async (t) => {
    const { downloader, mw, dump } = await setupScrapeClasses(); // en wikipedia

    const _articlesDetail = await downloader.getArticleDetailsIds(['London']);
    const articlesDetail = mwRetToArticleDetail(_articlesDetail);
    await articleDetailXId.flush();
    await articleDetailXId.setMany(articlesDetail);

    const offlineCSSUrl = `https://en.wikipedia.org/w/index.php?title=Mediawiki:offline.css&action=raw`;
    const siteStylesUrl = `http://en.wikipedia.org/w/load.php?lang=en&modules=site.styles&only=styles&skin=vector`;

    await Axios.get(offlineCSSUrl)
        .then(async (resp) => {
            const offlineCSSContent=resp.data;

            await Axios.get(siteStylesUrl)
                .then(async (resp) =>{
                    const siteStylesContent=resp.data;
                    const { finalCss } = await getAndProcessStylesheets(downloader, [offlineCSSUrl, siteStylesUrl]);

                    t.assert(finalCss.includes(offlineCSSUrl), `Contains offline CSS url`);
                    t.assert(finalCss.includes(offlineCSSContent), `Contains offline CSS content`);
        
                    t.assert(finalCss.includes(siteStylesUrl), `Contains site CSS url`);
                    t.assert(!finalCss.includes(siteStylesContent), `Contains re-written site CSS content`);

                })
                .catch(async (err) => {
                    logger.log(err.message, ' for ', siteStylesUrl)
                    const { finalCss } = await getAndProcessStylesheets(downloader, [offlineCSSUrl]);

                    t.assert(finalCss.includes(offlineCSSUrl), `Contains offline CSS url`);
                    t.assert(finalCss.includes(offlineCSSContent), `Contains offline CSS content`);
                })
        })
        .catch( async (err) => {
            logger.log(err.message, ' for ', offlineCSSUrl)
            await Axios.get(siteStylesUrl)
                .then(async (resp) => {
                    const siteStylesContent=resp.data;
                    const { finalCss } = await getAndProcessStylesheets(downloader, [siteStylesUrl]);

                    t.assert(finalCss.includes(siteStylesUrl), `Contains site CSS url`);
                    t.assert(!finalCss.includes(siteStylesContent), `Contains re-written site CSS content`);
                })
                .catch(async (err) => {
                    logger.log(err.message, ' for ', siteStylesUrl)
                })
        });
});