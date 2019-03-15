import { makeRedirectsQueue } from '../queues/redirectQueue';
import Downloader from '../Downloader';
import async, { AsyncCargo } from 'async';
import logger from '../Logger';
import { mapLimit } from '.';
import Redis from '../redis';
import MediaWiki from '../MediaWiki';
import { articleDetailXId } from '../articleDetail';

export async function getArticleIds(downloader: Downloader, redis: Redis, mw: MediaWiki, mainPage?: string, articleIds?: string[]) {
    const redirectQueue = makeRedirectsQueue(downloader, redis, mainPage);

    let articleVals: Array<{ redirectValues: any, articleDetailXId: any, next: any, scrapeDetails: any }> = [];
    if (articleIds) {
        const vals = await getArticleIdsForList(articleIds, downloader, mw);
        articleVals = articleVals.concat(vals.filter((a) => a));
    } else {
        const vals = await getArticleIdsForNamespaces(downloader, mw);
        articleVals = articleVals.concat(vals);
    }

    if (mainPage) {
        const [mainPageRet] = await getArticleIdsForList([mainPage], downloader, mw);
        articleVals.push(mainPageRet);
    }

    for (const { redirectValues, articleDetailXId: _articleDetailXId, next, scrapeDetails } of articleVals) {
        Object.assign(articleDetailXId, _articleDetailXId);
        if (redirectValues.length) { redirectQueue.push(redirectValues); }
        redis.saveArticles(scrapeDetails);
    }

    return redirectQueue;
}

export function drainRedirectQueue(redirectQueue: AsyncCargo) {
    return new Promise((resolve, reject) => {
        redirectQueue.drain = function drain(error: any) {
            if (error) {
                reject(`Unable to retrieve redirects for an article: ${error}`);
            } else {
                logger.log('All redirect ids retrieve successfuly.');
                resolve();
            }
        } as any;
        redirectQueue.push('');
    });
}

/* Parse article list given by API */
function parseAPIResponse(body: KVS<any>, mw: MediaWiki) {
    let next = '';
    const entries = body.query && body.query.pages;
    const redirectQueueValues: string[] = [];
    const scrapeDetails: KVS<string> = {};

    if (entries) {
        Object.keys(entries).map((key) => {
            const entry = entries[key];
            entry.title = entry.title.replace(/ /g, mw.spaceDelimiter);

            if ('missing' in entry) {
                logger.warn(`Article ${entry.title} is not available on this wiki.`);
                delete articleDetailXId[entry.title];
            } else {
                redirectQueueValues.push(entry.title);

                if (entry.revisions) {
                    /* Get last revision id */
                    articleDetailXId[entry.title] = Object.assign(articleDetailXId[entry.title] || {}, {
                        title: entry.title,
                        oldId: entry.revisions[0].revid,
                        ns: entry.ns,
                        pageid: entry.pageid,
                    }) as PageInfo;

                    /* Get last revision id timestamp */
                    const articleDetails: { t: number, g?: string } = { t: new Date(entry.revisions[0].timestamp).getTime() / 1000 };

                    /* Get article geo coordinates */
                    if (entry.coordinates) {
                        articleDetails.g = `${entry.coordinates[0].lat};${entry.coordinates[0].lon}`;
                    }

                    /* Save as JSON string */
                    scrapeDetails[entry.title] = JSON.stringify(articleDetails);
                } else if (entry.pageid) {
                    logger.warn(`Unable to get revisions for ${entry.title}, but entry exists in the database. Article was probably deleted meanwhile.`);
                    delete articleDetailXId[entry.title];
                } else {
                    throw new Error(`Unable to get revisions for ${entry.title}\nJSON was ${body}`);
                }
            }
        });
    }

    /* Get continue parameters from 'query-continue',
     * unfortunately old MW version does not use the same way
     * than recent */
    const continueHash = body['query-continue'] && body['query-continue'].allpages;
    if (continueHash) {
        Object.keys(continueHash).forEach((key) => {
            next += `&${key}=${encodeURIComponent(continueHash[key])}`;
        });
    }

    return { next, redirectValues: redirectQueueValues, articleDetailXId, scrapeDetails };
}

/* Get ids from file */
async function getArticleIdsForList(articleIds: string[], downloader: Downloader, mw: MediaWiki) {
    return mapLimit(articleIds, downloader.speed, async (articleId) => {
        if (articleId) {
            const title = articleId.replace(/ /g, mw.spaceDelimiter).replace('\r', '');
            let body;
            try {
                body = await downloader.getJSON(mw.articleQueryUrl(title));
            } catch (err) {
                logger.warn(`Failed to download article [${title}], skipping`);
                return null;
            }

            if (body) {
                return parseAPIResponse(body, mw);
            } else {
                throw new Error(`Invalid body from query of [${title}]`);
            }
        } else {
            logger.warn(`Invalid articleId value [${articleId}], skipping`);
            return null;
        }
    }).then((a) => a.filter((a) => a));
}

/* Get ids from Mediawiki API */
async function getArticleIdsForNamespace(downloader: Downloader, mw: MediaWiki, namespace: string, _next: string = ''): Promise<{ next: string, redirectValues: string[], articleDetailXId: KVS<any>, scrapeDetails: KVS<any> }> {

    logger.log(`Getting article ids for [namespace=${namespace}] ${_next !== '' ? ` (from ${namespace ? `${namespace}:` : ''}${_next.split('=')[1]})` : ''}`);

    const url = mw.pageGeneratorQueryUrl(namespace, _next);
    const body = await downloader.getJSON(url);

    const { next, redirectValues, articleDetailXId, scrapeDetails } = parseAPIResponse(body, mw);

    if (next) {
        const nextData = await getArticleIdsForNamespace(downloader, mw, namespace, next);
        return {
            next: nextData.next,
            redirectValues: redirectValues.concat(nextData.redirectValues),
            articleDetailXId: Object.assign({}, articleDetailXId, nextData.articleDetailXId),
            scrapeDetails: Object.assign({}, scrapeDetails, nextData.scrapeDetails),
        };
    } else {
        return {
            next,
            redirectValues,
            articleDetailXId,
            scrapeDetails,
        };
    }
}

function getArticleIdsForNamespaces(downloader: Downloader, mw: MediaWiki) {
    return mapLimit(
        mw.namespacesToMirror,
        downloader.speed,
        (namespace: string) => getArticleIdsForNamespace(downloader, mw, namespace),
    );
}
