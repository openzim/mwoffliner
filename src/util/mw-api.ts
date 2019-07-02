import Downloader from '../Downloader';
import { mapLimit } from 'promiso';
import logger from '../Logger';
import { articleDetailXId, redirectsXId } from '../stores';
import deepmerge = require('deepmerge');

let batchSize = 50;
export async function getArticlesByIds(_articleIds: string[], downloader: Downloader, log = true): Promise<void> {
    let index = 0;
    let numArticleIds = _articleIds.length;

    // using mapLimit to spawn workers
    await mapLimit(
        ','.repeat(downloader.speed).split(',').map((_, i) => i),
        downloader.speed,
        async (workerId) => {
            while (index < numArticleIds) {
                const from = index;
                const to = index + batchSize;
                index += batchSize;
                if (log) {
                    const progressPercent = Math.min(Math.floor(to / numArticleIds * 100), 100);
                    logger.log(`Worker [${workerId}] getting article range [${from}-${to}] of [${numArticleIds}] [${progressPercent}%]`);
                }
                const articleIds = _articleIds.slice(from, to).map((id) => id.replace(/ /g, '_'));

                try {
                    if (articleIds.length) {
                        const articleDetails = await downloader.getArticleDetailsIds(articleIds);

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

    const { articleDetails, gapContinue } = await downloader.getArticleDetailsNS(ns, _gapContinue);

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
            const articleId = (normalized[page.title] || page.title || '').replace(/ /g, '_');
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
