import Downloader from '../Downloader';
import MediaWiki from '../MediaWiki';
import logger from '../Logger';
import { articleDetailXId } from '../articleDetail';

let articleIdBatchSize = 50;

// TODO: Implement paging of results
export async function getCategoriesForArticleIds(downloader: Downloader, mw: MediaWiki, articleIds: string[]): Promise<null> {
    const idsToProcess = articleIds.slice(0, articleIdBatchSize);
    if (idsToProcess.length <= 0) {
        return {} as any;
    }

    try {
        const categoriesRet = await downloader.getJSON<CategoriesRet>(mw.categoriesApiUrl(idsToProcess));
        const normalized: { [title: string]: string } = (categoriesRet.query.normalized || []).reduce((acc: any, { from, to }) => {
            acc[to] = from;
            return acc;
        }, {});
        const categoryPages = Object.values(categoriesRet.query.pages);
        categoryPages.forEach((page) => {
            const articleId = normalized[page.title] || page.title;
            articleDetailXId[articleId].categories = page.categories || [];
        });

        await getCategoriesForArticleIds(downloader, mw, articleIds.slice(articleIdBatchSize));
    } catch (err) {
        if (articleIdBatchSize > 20) { // If it can't handle 30 at a time, there are other problems
            articleIdBatchSize = Math.floor(articleIdBatchSize * 0.9);
            console.warn(`Failed to fetch categories, retrying with a smaller batchSize [${articleIdBatchSize}]`, err);
            return getCategoriesForArticleIds(downloader, mw, articleIds);
        } else {
            logger.error(`Couldn't fetch categories [batchSize=${articleIdBatchSize}]`);
            throw err;
        }
    }
}
