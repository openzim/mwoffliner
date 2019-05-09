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
                        const catDetails = await articleDetailXId.getMany(foundCategoryIds);

                        for (const [id, detail] of Object.entries(catDetails)) {
                            // detail = detail || {};

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

                            const subArticles = (detail.subCategories || []).concat(detail.pages || []);
                            const shouldRemoveNode = subArticles.length <= 3;
                            if (shouldRemoveNode) {
                                // Update sub pages
                                // Add parent categories to child pages
                                for (const page of detail.pages) {
                                    if (page.title) {
                                        const pageId = page.title.replace(/ /g, '_');
                                        const pageDetail = await articleDetailXId.get(pageId);
                                        if (pageDetail) {
                                            pageDetail.categories = (pageDetail.categories || [])
                                                .filter((c) => c && c.title !== detail.title)
                                                .concat(detail.categories || []);

                                            pageDetail.categories = deDup(pageDetail.categories, (o) => o.title);

                                            await articleDetailXId.set(pageId, pageDetail);
                                        }
                                    }
                                }

                                // Update parent categories
                                // Add children to parent categories
                                for (const cat of detail.categories || []) {
                                    const catId = cat.title.replace(/ /g, '_');
                                    const category = await articleDetailXId.get(catId);

                                    const categoryData = Object.assign({ pages: [], subCategories: [] }, category || {}) as ArticleDetail;

                                    categoryData.pages = categoryData.pages.concat(detail.pages);
                                    categoryData.subCategories = categoryData.subCategories.concat(detail.subCategories).filter((c) => c.title === id);

                                    categoryData.pages = deDup(categoryData.pages, (o) => o.title);
                                    categoryData.subCategories = deDup(categoryData.subCategories, (o) => o.title);

                                    await articleDetailXId.set(catId, categoryData);
                                }

                                await articleDetailXId.delete(id);
                            } else {
                                await articleDetailXId.set(id, detail);
                            }
                        }
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
    logger.log(`Trimming un-mirrored articles from [${await articleDetailXId.len()}] articles`);
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

                    let hasUpdated = false;
                    if (Object.entries(categories).some(([, a]) => isNull(a))) {
                        hasUpdated = true;
                        articleDetail.categories = articleDetail.categories.filter((c, i) => !!categories[i]);
                    }
                    if (Object.entries(subCategories).some(([, a]) => isNull(a))) {
                        hasUpdated = true;
                        articleDetail.subCategories = articleDetail.subCategories.filter((c, i) => !!subCategories[i]);
                    }
                    if (Object.entries(pages).some(([, a]) => isNull(a))) {
                        hasUpdated = true;
                        articleDetail.pages = articleDetail.pages.filter((c, i) => !!pages[i]);
                    }

                    if (hasUpdated) {
                        await articleDetailXId.set(articleId, articleDetail);
                    }

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
