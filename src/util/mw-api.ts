import Downloader from '../Downloader';
import { mapLimit } from 'promiso';
import logger from '../Logger';
import { articleDetailXId, redirectsXId } from '../stores';
import { parse as parseUrl } from 'url';
import deepmerge = require('deepmerge');

let batchSize = 50;
export async function getArticlesByIds(_articleIds: string[], downloader: Downloader, log = true): Promise<void> {
    let from = 0;
    let numArticleIds = _articleIds.length;

    // using mapLimit to spawn workers
    await mapLimit(
        ','.repeat(downloader.speed).split(',').map((_, i) => i),
        downloader.speed,
        async (workerId) => {
            while (from < numArticleIds) {
                const articleIds = _articleIds.slice(from, from + batchSize).map((id) => id.replace(/ /g, '_'));
                const to = from + articleIds.length;
                if (log) {
                    const progressPercent = Math.floor(to / numArticleIds * 100);
                    logger.log(`Worker [${workerId}] getting article range [${from}-${to}] of [${numArticleIds}] [${progressPercent}%]`);
                }
                from = to;

                try {
                    if (articleIds.length) {
                        const _articleDetails = await downloader.getArticleDetailsIds(articleIds);
                        const articleDetails = mwRetToArticleDetail(downloader, _articleDetails);

                        const redirectIds = Object.values(articleDetails).reduce((acc, d) => acc.concat(d.redirects || []), []);
                        await redirectsXId.setMany(
                            redirectIds.reduce((acc, redirect) => {
                                const redirectId = redirect.title.replace(/ /g, '_');
                                return {
                                    ...acc,
                                    [redirectId]: 1,
                                };
                            }, {}),
                        );

                        const existingArticleDetails = await articleDetailXId.getMany(articleIds);

                        await articleDetailXId.setMany(
                            deepmerge(
                                existingArticleDetails,
                                articleDetails,
                            ),
                        );

                    }
                } catch (err) {
                    if (batchSize < 10) {
                        logger.warn(`Failed to get article ids and batch size is less than 10. Skipping batch...`, err);
                    } else {
                        _articleIds = _articleIds.concat(articleIds);
                        numArticleIds = _articleIds.length;
                        batchSize = Math.floor(batchSize * 0.8);
                        logger.warn(`Failed to get article ids, reducing batch size to [${batchSize}]`, err);
                    }
                }
            }
        },
    );
}

export async function getArticlesByNS(ns: number, downloader: Downloader, _gapContinue?: string, continueLimit?: number): Promise<void> {
    let index = 0;

    const { articleDetails: _articleDetails, gapContinue } = await downloader.getArticleDetailsNS(ns, _gapContinue);

    const articleDetails = mwRetToArticleDetail(downloader, _articleDetails);

    const numDetails = Object.keys(articleDetails).length;
    index += numDetails;
    await articleDetailXId.setMany(articleDetails);

    const redirectIds = Object.values(articleDetails).reduce((acc, d) => acc.concat(d.redirects || []), []);
    await redirectsXId.setMany(
        redirectIds.reduce((acc, redirect) => {
            const redirectId = redirect.title.replace(/ /g, '_');
            return {
                ...acc,
                [redirectId]: 1,
            };
        }, {}),
    );

    logger.log(`Got [${index}] articles from namespace [${ns}]`);

    const canContinue = typeof continueLimit === 'undefined' || continueLimit > 0; // used for testing

    if (gapContinue && canContinue) {
        const nextContinueLimit = typeof continueLimit === 'undefined' ? undefined : continueLimit - 1;
        return getArticlesByNS(ns, downloader, gapContinue, nextContinueLimit);
    }
}

export function normalizeMwResponse(response: MwApiQueryResponse): QueryMwRet {
    if (!response) {
        return {};
    }
    const { normalized: _normalized, pages } = response;

    const normalized = (_normalized || []).reduce((acc: any, { from, to }) => {
        acc[to] = from;
        return acc;
    }, {});

    return Object.values(pages)
        .reduce((acc, page) => {
            const id = (normalized[page.title] || page.title || '');
            if (typeof id !== 'string') {
                throw new Error(`Article Id is invalid - expected a string but got [${id}]`);
            }
            const articleId = id.replace(/ /g, '_');
            if (articleId) {
                return {
                    ...acc,
                    [articleId]: page,
                };
            } else {
                return acc;
            }
        }, {});
}

export function mwRetToArticleDetail(downloader: Downloader, obj: QueryMwRet): KVS<ArticleDetail> {
    const ret: KVS<ArticleDetail> = {};
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        const rev = val.revisions && val.revisions[0];
        const geo = val.coordinates && val.coordinates[0];
        let newThumbnail = null;
        if (val.thumbnail) {
            newThumbnail = {
                width: val.thumbnail.width,
                height: val.thumbnail.height,
                source: downloader.serialiseUrl(val.thumbnail.source),
            };
        }
        ret[key] = {
            title: val.title,
            ns: val.ns,
            cats: val.categories,
            subCats: val.subCats,
            thumbnail: newThumbnail,
            redirects: val.redirects,
            missing: val.missing,
            ...(rev ? { oId: rev.revid, t: rev.timestamp } : {}),
            ...(geo ? { g: `${geo.lat};${geo.lon}` } : {}),
        };
    }
    return ret;
}
