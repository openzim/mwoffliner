import Downloader from '../Downloader';
import { mapLimit } from './mapLimit';
import { articleDetailXId } from '../articleDetail';
import logger from '../Logger';

const batchSize = 50;
export async function getArticlesByIds(_articleIds: string[], downloader: Downloader): Promise<void> {
    let index = 0;
    const numArticleIds = _articleIds.length;

    // using mapLimit to spawn workers
    await mapLimit(
        ','.repeat(downloader.speed).split(',').map((_, i) => i),
        downloader.speed,
        async (workerId) => {
            while (index < numArticleIds) {
                const from = index;
                const to = index + batchSize;
                logger.log(`Worker [${workerId}] getting article range [${from}-${to}] of [${numArticleIds}] (${Math.floor(to / numArticleIds * 100)}%)`);
                const articleIds = _articleIds.slice(from, to);
                index += batchSize;

                if (articleIds.length) {
                    const articleDetails = await downloader.getArticleDetailsIds(articleIds);
                    await articleDetailXId.setMany(articleDetails);
                }
            }
        },
    );
}

export async function getArticlesByNS(ns: number, downloader: Downloader, _gapContinue?: string): Promise<void> {
    let index = 0;

    const { articleDetails, gapContinue } = await downloader.getArticleDetailsNS(ns, _gapContinue);

    const numDetails = Object.keys(articleDetails).length;
    index += numDetails;
    await articleDetailXId.setMany(articleDetails);

    logger.log(`Got [${index}] articles from namespace [${ns}]`);

    if (gapContinue) {
        return getArticlesByNS(ns, downloader, gapContinue);
    }
}

export function normalizeMwResponse(response: MwApiQueryResponse): QueryMwRet {
    const { normalized: _normalized, pages } = response;

    const normalized = (_normalized || []).reduce((acc: any, { from, to }) => {
        acc[to] = from;
        return acc;
    }, {});

    return Object.values(pages)
        .reduce((acc, page) => {
            const articleId = normalized[page.title] || page.title;
            return {
                ...acc,
                [articleId]: page,
            };
        }, {});
}
