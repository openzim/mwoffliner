import { makeRedirectsQueue } from "../queues/redirectQueue";
import Downloader from "../Downloader";
import async, { AsyncCargo } from "async";
import logger from "../Logger";
import { readFilePromise } from "./misc";
import { mapLimit } from ".";
import Redis from "../redis";
import MediaWiki from "../MediaWiki";

export async function getArticleIds(downloader: Downloader, redis: Redis, mw: MediaWiki, mainPage: string, articleList?: string) {
    const redirectQueue = makeRedirectsQueue(downloader, redis, mainPage);

    let articleVals: { redirectValues: any, articleDetailXId: any, next: any, scrapeDetails: any }[] = [];
    if (articleList) {
        const vals = await getArticleIdsForFile(articleList, downloader, mw);
        articleVals = articleVals.concat(vals.filter(a => a));
    } else {
        const vals = await getArticleIdsForNamespaces(downloader, mw);
        articleVals = articleVals.concat(vals);
    }

    articleVals.push(await getArticleIdsForLine(downloader, mainPage, mw));

    const articleDetailXIdOut: KVS<any> = {};

    for (let { redirectValues, articleDetailXId, next, scrapeDetails } of articleVals) {
        Object.assign(articleDetailXIdOut, articleDetailXId);
        if (redirectValues.length) { redirectQueue.push(redirectValues); }
        redis.saveArticles(scrapeDetails);
    }

    return { redirectQueue, articleDetailXId: articleDetailXIdOut };
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
    const articleDetailXId: KVS<any> = {};
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
                    });

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

async function getArticleIdsForLine(downloader: Downloader, line: string, mw: MediaWiki) {
    const title = line.replace(/ /g, mw.spaceDelimiter).replace('\r', '')
    try {
        const body = await downloader.getJSON(mw.articleQueryUrl(title));
        return parseAPIResponse(body, mw);
    } catch (err) {
        throw new Error(`Invalid body from query of [${title}]`);
    }
}

/* Get ids from file */
async function getArticleIdsForFile(articleList: string, downloader: Downloader, mw: MediaWiki) {
    const lines: string[] = (await readFilePromise(articleList) as string).split('\n');

    return mapLimit(lines, downloader.speed, async (line) => {
        if (line) {
            const title = line.replace(/ /g, mw.spaceDelimiter).replace('\r', '');
            const body = await downloader.getJSON(mw.articleQueryUrl(title))
            if (body) {
                return parseAPIResponse(body, mw);
            } else {
                throw new Error(`Invalid body from query of [${title}]`);
            }
        } else {
            return Promise.reject(`Invalid line value [${line}]`);
        }
    });
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
        }
    } else {
        return {
            next,
            redirectValues,
            articleDetailXId,
            scrapeDetails,
        }
    }
}

function getArticleIdsForNamespaces(downloader: Downloader, mw: MediaWiki) {
    return mapLimit(
        mw.namespacesToMirror,
        downloader.speed,
        (namespace: string) => getArticleIdsForNamespace(downloader, mw, namespace)
    );
}