import Downloader from '../Downloader';
import { RedisKvs } from './redis-kvs';
import Redis from '../redis';
import logger from '../Logger';
import { articleDetailXId } from '../stores';
import { getArticlesByIds } from './mw-api';
import { deDup } from '.';
import { isNull } from 'util';

export async function getCategoriesForArticles(articleStore: RedisKvs<ArticleDetail>, downloader: Downloader, redis: Redis, deleteArticleStore = false): Promise<void> {
    const nextCategoriesBatch = new RedisKvs<ArticleDetail>(redis.redisClient, `${Date.now()}-request`);
    logger.log(`Fetching categories for [${await articleStore.len()}] articles`);

    await articleStore
        .iterateItems(
            downloader.speed,
            async (articleKeyValuePairs, workerId) => {
                const articleKeys = Object.keys(articleKeyValuePairs);
                logger.log(`Worker [${workerId}] getting categories for articles ${logger.logifyArray(articleKeys)}`);

                const pagesXCategoryId: { [categoryId: string]: PageInfo[] } = Object.entries(articleKeyValuePairs)
                    .reduce((acc: any, [aId, detail]) => {
                        for (const cat of detail.categories || []) {
                            const catId = cat.title.replace(/ /g, '_');
                            acc[catId] = (acc[catId] || []).concat({ title: detail.title, pageid: detail.pageid, ns: detail.ns } as PageInfo);
                        }
                        return acc;
                    }, {});

                const foundCategoryIds = Object.keys(pagesXCategoryId);
                if (foundCategoryIds.length) {
                    const existingArticles = await articleDetailXId.getMany(foundCategoryIds);
                    const categoriesToGet = Object.entries(existingArticles).filter(([id, detail]) => !detail).map(([id]) => id);
                    if (categoriesToGet.length) {
                        await getArticlesByIds(categoriesToGet, downloader, false);
                    }

                    const catDetails = await articleDetailXId.getMany(foundCategoryIds);

                    for (const [id, detail] of Object.entries(catDetails)) {
                        if (!detail) {
                            continue;
                        }

                        const parentCategories = (detail.categories || [])
                            .reduce((acc, info) => {
                                const articleId = info.title.replace(/ /g, '_');
                                return {
                                    ...acc,
                                    [articleId]: info,
                                };
                            }, {});

                        await nextCategoriesBatch.setMany(parentCategories);

                        detail.pages = (detail.pages || []).concat(pagesXCategoryId[id]);

                        await articleDetailXId.set(id, detail);
                    }
                }
            },
        );

    if (deleteArticleStore) {
        await articleStore.flush();
    }

    const nextBatchSize = await nextCategoriesBatch.len();
    if (nextBatchSize) {
        return getCategoriesForArticles(nextCategoriesBatch, downloader, redis, true);
    } else {
        return null;
    }
}

export async function trimUnmirroredPages(downloader: Downloader) {
    logger.log(`Trimming un-mirrored articles for [${await articleDetailXId.len()}] articles`);
    const numKeys = await articleDetailXId.len();
    let prevPercentProgress = -1;
    let processedArticles = 0;

    await articleDetailXId
        .iterateItems(
            downloader.speed,
            async (articleKeyValuePairs, workerId) => {

                for (const [articleId, articleDetail] of Object.entries(articleKeyValuePairs)) {
                    const categoryIds = (articleDetail.categories || []).map((c) => c.title.replace(/ /g, '_'));
                    const subCategoryIds = (articleDetail.subCategories || []).map((c) => c.title.replace(/ /g, '_'));
                    const pageIds = (articleDetail.pages || []).map((c) => c.title.replace(/ /g, '_'));

                    const [
                        categories,
                        subCategories,
                        pages,
                    ] = await Promise.all([
                        categoryIds.length ? articleDetailXId.getMany(categoryIds) : Promise.resolve({}),
                        subCategoryIds.length ? articleDetailXId.getMany(subCategoryIds) : Promise.resolve({}),
                        pageIds.length ? articleDetailXId.getMany(pageIds) : Promise.resolve({}),
                    ]);

                    articleDetail.categories = deDup(articleDetail.categories || [], (p) => p.title)
                        .filter((c, i) => {
                            const id = categoryIds[i];
                            return !!categories[id];
                        });

                    articleDetail.subCategories = deDup(articleDetail.subCategories || [], (p) => p.title)
                        .filter((c, i) => {
                            const id = subCategoryIds[i];
                            return !!subCategories[id];
                        });

                    articleDetail.pages = deDup(articleDetail.pages || [], (p) => p.title)
                        .filter((c, i) => {
                            const id = pageIds[i];
                            return !!pages[id];
                        });

                    await articleDetailXId.set(articleId, articleDetail);

                    processedArticles += 1;

                    if (processedArticles % 100 === 0) {
                        const percentProgress = Math.floor(processedArticles / numKeys * 1000) / 10;
                        if (percentProgress !== prevPercentProgress) {
                            prevPercentProgress = percentProgress;
                            logger.log(`Progress trimming un-mirrored articles [${processedArticles}/${numKeys}] [${percentProgress}%]`);
                        }
                    }
                }
            },
        );
}

export async function simplifyGraph(downloader: Downloader) {
    logger.log(`Simplifying graph (removing empty categories)`);
    const numKeys = await articleDetailXId.len();
    let prevPercentProgress = -1;
    let processedArticles = 0;
    let deletedNodes = 0;

    await articleDetailXId
        .iterateItems(
            downloader.speed,
            async (articleKeyValuePairs, workerId) => {
                for (const [articleId, articleDetail] of Object.entries(articleKeyValuePairs)) {
                    processedArticles += 1;

                    if (articleDetail.ns !== 14) {
                        continue; // Only trim category articles
                    }

                    const subArticles = (articleDetail.subCategories || []).concat(articleDetail.pages || []);
                    const shouldRemoveNode = subArticles.length <= 3;
                    if (shouldRemoveNode) {
                        // Update sub pages
                        // Add parent categories to child pages
                        const hasPages = articleDetail.pages && articleDetail.pages.length;
                        const scrapedPages = hasPages ? await articleDetailXId.getMany(articleDetail.pages.map((p) => p.title.replace(/ /g, '_'))) : {};
                        for (const [pageId, pageDetail] of Object.entries(scrapedPages)) {
                            if (pageDetail) {
                                pageDetail.categories = (pageDetail.categories || [])
                                    .filter((c) => c && c.title !== articleDetail.title) // remove self
                                    .concat(articleDetail.categories || []); // add parent categories

                                pageDetail.categories = deDup(pageDetail.categories, (o) => o.title);

                                await articleDetailXId.set(pageId, pageDetail);
                            }
                        }

                        // Update parent categories
                        // Add children to parent categories
                        const hasCategories = articleDetail.categories && articleDetail.categories.length;
                        const scrapedCategories = hasCategories ? await articleDetailXId.getMany(articleDetail.categories.map((p) => p.title.replace(/ /g, '_'))) : {};
                        for (const [catId, catDetail] of Object.entries(scrapedCategories)) {
                            if (catDetail) {
                                const categoryDetail = Object.assign({ pages: [], subCategories: [] }, catDetail || {}) as ArticleDetail;

                                categoryDetail.pages = categoryDetail.pages.concat(articleDetail.pages);
                                categoryDetail.subCategories = categoryDetail.subCategories.concat(articleDetail.subCategories).filter((c) => c.title === articleDetail.title);

                                categoryDetail.pages = deDup(categoryDetail.pages, (o) => o.title);
                                categoryDetail.subCategories = deDup(categoryDetail.subCategories, (o) => o.title);

                                await articleDetailXId.set(catId, categoryDetail);
                            }
                        }

                        await articleDetailXId.delete(articleId);
                        deletedNodes += 1;
                    }
                }

                if (processedArticles % 10 === 0) {
                    const percentProgress = Math.floor(processedArticles / numKeys * 1000) / 10;
                    if (percentProgress !== prevPercentProgress) {
                        prevPercentProgress = percentProgress;
                        logger.log(`Progress simplifying graph [${processedArticles}/${numKeys}] [${percentProgress}%] deleted [${deletedNodes}]`);
                    }
                }
            });
    return { deletedNodes };
}
