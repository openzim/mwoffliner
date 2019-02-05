import logger from "../Logger";
import async from "async";
import Downloader from "../Downloader";
import Redis from "../redis";

/* Get ids */
let articlesPerQuery = 500;
export function makeRedirectsQueue(downloader: Downloader, redis: Redis, mainPage: string) {
    const redirectQueue = async.cargo(async (articleIds, finished) => {
        articleIds = articleIds.filter((id) => id.trim());
        if (articleIds && articleIds.length) {
            const queryStrings = backlinkRedirectsQueries(articleIds, articlesPerQuery, 7000);
            logger.info(`Got [${queryStrings.length}] redirect urls for [${articleIds.length}] articles`);
            try {
                const redirects: any = {};
                let redirectsCount = 0;
                const { pages, normalized } = await (
                    Promise.all(queryStrings.map((query) => downloader.query(query)))
                        .then((resps) => {
                            return resps.reduce((acc, body) => {
                                if (body.error) {
                                    throw new Error(`Failed to parse JSON response: [${body.error}]`);
                                }
                                const { pages, normalized } = body.query;

                                acc.normalized = acc.normalized.concat(normalized);
                                Object.assign(acc.pages, pages);
                                return acc;
                            }, { pages: {}, normalized: [] });
                        })
                );

                const fromXTo = normalized
                    .filter((a: any) => a)
                    .reduce((acc: any, item: any) => {
                        acc[item.to] = item.from;
                        return acc;
                    }, {});

                const pageIds = Object.keys(pages);

                for (const pageId of pageIds) {

                    const { redirects: _redirects, title } = pages[pageId];
                    const originalArticleId = fromXTo[title] || title;
                    if (_redirects) {
                        for (const redirect of _redirects) {
                            const title = redirect.title.replace(/ /g, downloader.mw.spaceDelimiter);
                            redirects[title] = originalArticleId;
                            redirectsCount += 1;
                            if (title === mainPage) {
                                mainPage = originalArticleId;
                            }
                        }
                    }
                }

                logger.log(`${redirectsCount} redirect(s) found`);
                redis.saveRedirects(redirectsCount, redirects, finished);
            } catch (err) {
                logger.warn(`Failed to get redirects for ids: [${articleIds.join('|')}], retrying`);
                logger.error(err);
                articlesPerQuery = Math.max(1, Math.round(articlesPerQuery - articlesPerQuery / 5));
                for (const id of articleIds) {
                    redirectQueue.push(id);
                }
                finished(err);
            }
        } else {
            finished();
        }
    }, Math.min(downloader.speed * 100, 500));
    return redirectQueue;
}



function backlinkRedirectsQueries(articleIds: string[], maxArticlesPerUrl: number, maxUrlLength: number): string[] {
    const baseUrl = `action=query&prop=redirects&format=json&rdprop=title&rdlimit=max&rawcontinue=&titles=`;
    const redirectUrls = articleIds.reduce(({ urls, activeUrlArticleCount }, articleId) => {
        const encodedArticleId = encodeURIComponent(articleId);
        const url = urls[urls.length - 1];
        if (!urls.length || url.length + encodedArticleId.length > maxUrlLength || activeUrlArticleCount >= maxArticlesPerUrl) {
            urls.push(baseUrl + encodedArticleId);
            activeUrlArticleCount = 1;
        } else {
            urls[urls.length - 1] += '|' + encodedArticleId;
            activeUrlArticleCount += 1;
        }
        return { urls, activeUrlArticleCount };
    }, { urls: [], activeUrlArticleCount: 0 });
    return redirectUrls.urls;
}