import Downloader from '../Downloader';
import { RedisKvs } from './redis-kvs';
import Redis from '../redis';
import logger from '../Logger';
import { articleDetailXId } from '../stores';
import { getArticlesByIds } from './mw-api';
import { deDup } from '.';

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
                        for (const cat of detail.cats || []) {
                            const catId = cat.title.replace(/ /g, '_');
                            acc[catId] = (acc[catId] || []).concat({ title: detail.title, ns: detail.ns } as PageInfo);
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

                        const parentCategories = (detail.cats || [])
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
    let modifiedArticles = 0;

    await articleDetailXId
        .iterateItems(
            downloader.speed,
            async (articleKeyValuePairs, workerId) => {

                for (const [articleId, articleDetail] of Object.entries(articleKeyValuePairs)) {
                    processedArticles += 1;
                    if (typeof (articleDetail as any).missing === 'string') {
                        await articleDetailXId.delete(articleId);
                        modifiedArticles += 1;

                        // TODO: remove references to current article on delete
                        continue;
                    }

                    const categoriesXId: any = (articleDetail.cats || []).reduce((acc: any, c) => {
                        acc[c.title.replace(/ /g, '_')] = c;
                        return acc;
                    }, {});
                    const categoryIds = Object.keys(categoriesXId);
                    const subCategoriesXId: any = (articleDetail.subCats || []).reduce((acc: any, c) => {
                        acc[c.title.replace(/ /g, '_')] = c;
                        return acc;
                    }, {});
                    const subCategoryIds = Object.keys(subCategoriesXId);
                    const pagesXId: any = (articleDetail.pages || []).reduce((acc: any, c) => {
                        acc[c.title.replace(/ /g, '_')] = c;
                        return acc;
                    }, {});
                    const pageIds = Object.keys(pagesXId);

                    const [
                        categoriesExist,
                        subCategoriesExist,
                        pagesExist,
                    ] = await Promise.all([
                        categoryIds.length ? articleDetailXId.exists(categoryIds) : Promise.resolve({}),
                        subCategoryIds.length ? articleDetailXId.exists(subCategoryIds) : Promise.resolve({}),
                        pageIds.length ? articleDetailXId.exists(pageIds) : Promise.resolve({}),
                    ]);

                    const existingCategories = Object.keys(categoriesExist).filter((key) => !!categoriesExist[key]);
                    const existingSubCategories = Object.keys(subCategoriesExist).filter((key) => !!subCategoriesExist[key]);
                    const existingPages = Object.keys(pagesExist).filter((key) => !!pagesExist[key]);

                    let hasUpdated = false;

                    const newCategoryKeys = deDup(existingCategories || [], (p) => p);
                    const newCategories = newCategoryKeys.map((key) => categoriesXId[key]);
                    if (newCategories.length !== categoryIds.length) {
                        articleDetail.cats = newCategories;
                        hasUpdated = true;
                    }

                    const newSubCategoryKeys = deDup(existingSubCategories || [], (p) => p);
                    const newSubCategories = newSubCategoryKeys.map((key) => subCategoriesXId[key]);
                    if (newSubCategories.length !== subCategoryIds.length) {
                        articleDetail.subCats = newSubCategories;
                        hasUpdated = true;
                    }

                    const newPageKeys = deDup(existingPages || [], (p) => p);
                    const newPages = newPageKeys.map((key) => pagesXId[key]);
                    if (newPages.length !== pageIds.length) {
                        articleDetail.pages = newPages;
                        hasUpdated = true;
                    }

                    if (hasUpdated) {
                        await articleDetailXId.set(articleId, articleDetail);
                        modifiedArticles += 1;
                    }

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

    return modifiedArticles;
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

                    const subArticles = (articleDetail.subCats || []).concat(articleDetail.pages || []);
                    const shouldRemoveNode = subArticles.length <= 3;
                    if (shouldRemoveNode) {
                        // Update sub pages
                        // Add parent categories to child pages
                        const hasPages = articleDetail.pages && articleDetail.pages.length;
                        const scrapedPages = hasPages ? await articleDetailXId.getMany(articleDetail.pages.map((p) => p.title.replace(/ /g, '_'))) : {};
                        for (const [pageId, pageDetail] of Object.entries(scrapedPages)) {
                            if (pageDetail) {
                                pageDetail.cats = (pageDetail.cats || [])
                                    .filter((c) => c && c.title !== articleDetail.title) // remove self
                                    .concat(articleDetail.cats || []); // add parent categories

                                pageDetail.cats = deDup(pageDetail.cats, (o) => o.title);

                                await articleDetailXId.set(pageId, pageDetail);
                            }
                        }

                        // Update parent categories
                        // Add children to parent categories
                        const hasCategories = articleDetail.cats && articleDetail.cats.length;
                        const scrapedCategories = hasCategories ? await articleDetailXId.getMany(articleDetail.cats.map((p) => p.title.replace(/ /g, '_'))) : {};
                        for (const [catId, catDetail] of Object.entries(scrapedCategories)) {
                            if (catDetail) {
                                const categoryDetail = Object.assign({ pages: [], subCats: [] }, catDetail || {}) as ArticleDetail;

                                categoryDetail.pages = categoryDetail.pages.concat(articleDetail.pages);
                                categoryDetail.subCats = categoryDetail.subCats.concat(articleDetail.subCats).filter((c) => c.title === articleDetail.title);

                                categoryDetail.pages = deDup(categoryDetail.pages, (o) => o.title);
                                categoryDetail.subCats = deDup(categoryDetail.subCats, (o) => o.title);

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
