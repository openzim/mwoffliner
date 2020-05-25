import pMap from 'p-map';
import logger from '../Logger';
import Downloader from '../Downloader';
import { articleDetailXId, redirectsXId } from '../stores';


export async function getArticlesByIds(_articleIds: string[], downloader: Downloader, log = true): Promise<void> {
    let from = 0;
    let numArticleIds = _articleIds.length;
    let numThumbnails = 0;
    let batchSize = 200;

    const handler = async (workerId: number) => {
        while (from < numArticleIds) {
            const articleIds = _articleIds.slice(from, from + batchSize).map((id) => id.replace(/ /g, '_'));
            const to = from + articleIds.length;
            if (log) {
                const progressPercent = (to / numArticleIds * 100).toFixed(0);
                logger.log(`Worker [${workerId}] getting article range [${from}-${to}] of [${numArticleIds}] [${progressPercent}%]`);
            }
            from = to;

            try {
                if (!articleIds.length) continue;
                const articleDetails = await downloader.getArticleDetailsIds(articleIds, numThumbnails < 100);
                const articlesWithThumbnail = Object.values(articleDetails).filter((a) => !!a.thumbnail);
                numThumbnails += articlesWithThumbnail.length;

                for (const [articleId, articleDetail] of Object.entries(articleDetails)) {
                    if (!articleDetail?.redirects?.length) continue;
                    await redirectsXId.setMany(getRedirectsFromArticle(articleId, articleDetail));
                }
                await articleDetailXId.addMany(articleDetails, articleIds);

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
    };
    await pMap([...Array(downloader.speed).keys()], handler, {concurrency: downloader.speed, stopOnError: false});
}

export async function getArticlesByNS(ns: number, downloader: Downloader, continueLimit?: number): Promise<void> {
    let totalArticles = 0;
    let chunk: { articleDetails: KVS<ArticleDetail>, gapContinue: string };

    do {
        chunk = await downloader.getArticleDetailsNS(ns, chunk && chunk.gapContinue);

        await articleDetailXId.setMany(chunk.articleDetails);

        for (const item of Object.entries(chunk.articleDetails)) {
            await redirectsXId.setMany(getRedirectsFromArticle(...item));
        }

        const numDetails = Object.keys(chunk.articleDetails).length;
        logger.log(`Got [${numDetails}] articles chunk from namespace [${ns}]`);
        totalArticles += numDetails;

        // Only for testing purposes
        if (--(continueLimit as number) < 0) break;
    } while (chunk.gapContinue);

    logger.log(`A total of [${totalArticles}] articles has been found in namespace [${ns}]`);
}

function getRedirectsFromArticle(id: string, details: ArticleDetail): KVS<any> {
    return (details.redirects || []).reduce((acc, redirect) => {
        const rId = redirect.title.replace(/ /g, '_');
        return {
            ...acc,
            [rId]: {targetId: id, title: redirect.title},
        };
    }, {});
}

export function normalizeMwResponse(response: MwApiQueryResponse): QueryMwRet {
    if (!response) {
        return {};
    }
    const { normalized: _normalized = [], pages = {}} = response;

    const normalized = _normalized.reduce((acc: any, { from, to }) => {
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
            return articleId ? {...acc, [articleId]: page} : acc;
        }, {});
}

