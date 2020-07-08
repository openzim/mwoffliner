import pmap from 'p-map';
import deepmerge = require('deepmerge');
import logger from '../Logger';
import Downloader from '../Downloader';
import { articleDetailXId, redirectsXId } from '../stores';

export async function getArticlesByIds(_articleIds: string[], downloader: Downloader, log = true): Promise<void> {
    let from = 0;
    let numArticleIds = _articleIds.length;
    let numThumbnails = 0;
    let batchSize = 40;

    // using async iterator to spawn workers
    await pmap(
        ','.repeat(downloader.speed).split(',').map((_, i) => i),
        async (workerId: number) => {
            while (from < numArticleIds) {
                const articleIds = _articleIds.slice(from, from + batchSize);
                const to = from + articleIds.length;
                if (log) {
                    const progressPercent = Math.floor(to / numArticleIds * 100);
                    logger.log(`Worker [${workerId}] getting article range [${from}-${to}] of [${numArticleIds}] [${progressPercent}%]`);
                }
                from = to;

                try {
                    if (articleIds.length) {
                        const _articleDetails = await downloader.getArticleDetailsIds(articleIds, numThumbnails < 100);
                        const articlesWithThumbnail = Object.values(_articleDetails).filter((a) => !!a.thumbnail);
                        numThumbnails += articlesWithThumbnail.length;

                        const articleDetails = mwRetToArticleDetail(_articleDetails);

                        for (const [articleId, articleDetail] of Object.entries(_articleDetails)) {
                            if (articleDetail.redirects && articleDetail.redirects.length) {
                                await redirectsXId.setMany(
                                    articleDetail.redirects.reduce((acc, redirect) => {
                                        const rId = redirect.title;
                                        return {
                                            ...acc,
                                            [rId]: { targetId: articleId, title: redirect.title },
                                        };
                                    }, {}),
                                );
                            }
                        }

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
                        logger.error(`Failed to get article ids and batch size is less than 10. Skipping batch...`, err);
                        process.exit(1);
                    } else {
                        _articleIds = _articleIds.concat(articleIds);
                        numArticleIds = _articleIds.length;
                        batchSize = Math.floor(batchSize * 0.8);
                        logger.warn(`Failed to get article ids, reducing batch size to [${batchSize}]`, err);
                    }
                }
            }
        },
        {concurrency: downloader.speed}
    );
}

export async function getArticlesByNS(ns: number, downloader: Downloader, continueLimit?: number): Promise<void> {
    let totalArticles = 0;
    let chunk: { articleDetails: QueryMwRet, gapContinue: string };

    do {
        chunk = await downloader.getArticleDetailsNS(ns, chunk && chunk.gapContinue);

        await articleDetailXId.setMany(mwRetToArticleDetail(chunk.articleDetails));

        for (const [articleId, articleDetail] of Object.entries(chunk.articleDetails)) {
            await redirectsXId.setMany(
                (articleDetail.redirects || []).reduce((acc, redirect) => {
                    const rId = redirect.title;
                    return {
                        ...acc,
                        [rId]: { targetId: articleId, title: redirect.title },
                    };
                }, {}),
            );
        }

        const numDetails = Object.keys(chunk.articleDetails).length;
        logger.log(`Got [${numDetails}] articles chunk from namespace [${ns}]`);
        totalArticles += numDetails;

        // Only for testing purposes
        if (--(continueLimit as number) < 0) break;
    } while (chunk.gapContinue);

    logger.log(`A total of [${totalArticles}] articles has been found in namespace [${ns}]`);
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
            if (typeof id !== 'string' || !id) {
                logger.warn(`Article Id is invalid - expected a string but got [${id}], converting to string and continuing`);
            }
            const articleId = String(id).replace(/ /g, '_');
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

export function mwRetToArticleDetail(obj: QueryMwRet): KVS<ArticleDetail> {
    const ret: KVS<ArticleDetail> = {};
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        const rev = val.revisions && val.revisions[0];
        const geo = val.coordinates && val.coordinates[0];
        let newThumbnail;
        if (val.thumbnail) {
            newThumbnail = {
                width: val.thumbnail.width,
                height: val.thumbnail.height,
                source: val.thumbnail.source,
            };
        }
        ret[key] = {
            title: val.title,
            categories: val.categories,
            subCategories: val.subCategories,
            thumbnail: newThumbnail,
            missing: val.missing,
            ...(val.ns !== 0 ? { ns: val.ns } : {}),
            ...(rev ? { revisionId: rev.revid, timestamp: rev.timestamp } : {}),
            ...(geo ? { coordinates: `${geo.lat};${geo.lon}` } : {}),
        };
    }
    return ret;
}
