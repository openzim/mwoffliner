import Downloader from '../Downloader';
import { mapLimit } from 'promiso';
import logger from '../Logger';
import { zip } from './misc';
import { articleDetailXId } from '../stores';

let batchSize = 50;
export async function getArticlesByIds(_articleIds: string[], downloader: Downloader, isCategory = false): Promise<void> {
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
                if (!isCategory) {
                    logger.log(`Worker [${workerId}] getting article range [${from}-${to}] of [${numArticleIds}] [${Math.floor(to / numArticleIds * 100)}%]`);
                }
                const articleIds = _articleIds.slice(from, to);

                try {
                    if (articleIds.length) {
                        const articleDetails = await downloader.getArticleDetailsIds(articleIds);
                        await articleDetailXId.setMany(articleDetails);
                        const foundCategoryMapping: { [categoryId: string]: string[] } = {};
                        if (downloader.mw.getCategories && !isCategory) {
                            Object.assign(
                                foundCategoryMapping,
                                Object.entries(articleDetails)
                                    .reduce((acc: any, [aId, detail]) => {
                                        for (const cat of detail.categories || []) {
                                            const catId = cat.title.replace(/ /g, '_');
                                            acc[catId] = (acc[catId] || []).concat({ title: detail.title, pageid: detail.pageid, ns: detail.ns } as PageInfo);
                                        }
                                        return acc;
                                    }, {}),
                            );
                        }
                        // TODO: consider adding a --getSubCategories option

                        const foundCategoryIds = Object.keys(foundCategoryMapping);
                        if (foundCategoryIds.length) {
                            const existingArticles = await articleDetailXId.getMany(foundCategoryIds);
                            const categoriesToGet = foundCategoryIds.filter((c, index) => !existingArticles[index]);
                            logger.log(`Found [${categoriesToGet.length}] categories for pages, downloading`);
                            await getArticlesByIds(categoriesToGet, downloader, true);
                            const catDetails = await articleDetailXId.getMany(foundCategoryIds);

                            const catIdAndDetailPairs = zip(foundCategoryIds, catDetails);
                            for (let [id, detail] of catIdAndDetailPairs) {
                                detail = detail || {};
                                detail.pages = (detail.pages || []).concat(foundCategoryMapping[id]);
                                await articleDetailXId.set(id, detail);
                            }
                        }
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

export async function getArticlesByNS(ns: number, downloader: Downloader, _gapContinue?: string): Promise<void> {
    let index = 0;

    const { articleDetails, gapContinue } = await downloader.getArticleDetailsNS(ns, _gapContinue);

    const numDetails = Object.keys(articleDetails).length;
    index += numDetails;
    await articleDetailXId.setMany(articleDetails);
    logger.log(`Got [${index}] articles from namespace [${ns}]`);

    if (downloader.mw.getCategories) {
        const categoriesToGet = Object.values(articleDetails)
            .reduce((acc, detail) => {
                return acc.concat(detail.categories || []);
            }, [])
            .map((c) => c.title.replace(/ /g, '_'));
        if (categoriesToGet.length) {
            logger.log(`Found [${categoriesToGet.length}] categories for pages, downloading`);
            await getArticlesByIds(categoriesToGet, downloader, false);
        }
    }

    if (gapContinue) {
        return getArticlesByNS(ns, downloader, gapContinue);
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
            const articleId = normalized[page.title] || page.title;
            return {
                ...acc,
                [articleId]: page,
            };
        }, {});
}
