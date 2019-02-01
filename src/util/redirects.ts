import { makeRedirectsQueue } from "../queues/redirectQueue";
import Downloader from "../Downloader";
import async, { AsyncCargo } from "async";
import logger from "../Logger";
import { readFilePromise } from "./misc";
import { mapLimit } from ".";

export async function getArticleIds(downloader: Downloader, mainPage: string, articleList?: string) {
    const redirectQueue = makeRedirectsQueue(downloader);

    await getArticleIdsForLine(redirectQueue, mainPage);
    if (articleList) {
        await getArticleIdsForFile();
    } else {
        await getArticleIdsForNamespaces();
    }

    if (!articleList && !isMirrored(mainPage)) {
        await getArticleIdsForLine(redirectQueue, mainPage);
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
function parseAPIResponse(body: string) {
    let next = '';
    const json = JSON.parse(body);
    const entries = json.query && json.query.pages;
    const redirectQueueValues: string[] = [];
    const articleDetailXId: KVS<any> = {};

    if (entries) {
        const details: KVS<string> = {};
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
                    details[entry.title] = JSON.stringify(articleDetails);
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
    const continueHash = json['query-continue'] && json['query-continue'].allpages;
    if (continueHash) {
        Object.keys(continueHash).forEach((key) => {
            next += `&${key}=${encodeURIComponent(continueHash[key])}`;
        });
    }

    return { next, redirectValues: redirectQueueValues, articleDetailXId };
}

function getArticleIdsForLine(downloader: Downloader, line: string) {
    if (line) {
        const title = line.replace(/ /g, mw.spaceDelimiter).replace('\r', '');
        return downloader.downloadContent(mw.articleQueryUrl(title))
            .then(({ content }) => {
                const body = content.toString();
                if (body && body.length > 1) {
                    return parseAPIResponse(body);


                    if (redirectValues.length) { redirectQueue.push(redirectValues); }
                    redis.saveArticles(details);
                } else {
                    throw new Error(`Invalid body from query of [${title}]`);
                }
            });
    } else {
        return Promise.resolve();
    }
}

/* Get ids from file */
async function getArticleIdsForFile(downloader: Downloader, redirectQueue: AsyncCargo) {
    const lines: string[] = (await readFilePromise(articleList) as string).split('\n');

    mapLimit(lines, speed, (line) => {
        if (line) {
            const title = line.replace(/ /g, mw.spaceDelimiter).replace('\r', '');
            return downloader.downloadContent(mw.articleQueryUrl(title))
                .then(({ content }) => {
                    const body = content.toString();
                    if (body && body.length > 1) {
                        return parseAPIResponse(body);
                    } else {
                        throw new Error(`Invalid body from query of [${title}]`);
                    }
                });
        } else {
            return Promise.reject(`Invalid line value [${line}]`);
        }
    })
        .then((retVals) => {
            for (let { redirectValues, articleDetailXId, next } of retVals) {

                if (redirectValues.length) { redirectQueue.push(redirectValues); }
                redis.saveArticles(details);
            }
        })

    return new Promise((resolve, reject) => {
        async.eachLimit(
            lines,
            speed,
            (line, finish) => getArticleIdsForLine(redirectQueue, line).then(() => finish(), (err) => finish(err)),
            (error) => {
                if (error) {
                    reject({ message: `Unable to get all article ids for a file`, error });
                } else {
                    logger.log('List of article ids to mirror completed');
                    drainRedirectQueue(redirectQueue).then(resolve, reject);
                }
            });
    });
}

/* Get ids from Mediawiki API */
function getArticleIdsForNamespace(downloader: Downloader, namespace: string, finished: Callback) {
    let next = '';

    async.doWhilst(
        (finished) => {
            logger.log(
                `Getting article ids for namespace "${namespace}" ${next !== '' ? ` (from ${namespace ? `${namespace}:` : ''}${next.split('=')[1]})` : ''
                }...`,
            );
            const url = mw.pageGeneratorQueryUrl(namespace, next);
            const dc = downloader.downloadContent.bind(downloader);
            setTimeout((url, handler) => {
                dc(url)
                    .then(({ content }) => handler(content))
                    .catch((err) => finished(err));
            },
                redirectQueue.length() > 30000 ? redirectQueue.length() - 30000 : 0,
                url,
                (content: any) => {
                    const body = content.toString();
                    if (body && body.length > 1) {
                        next = parseAPIResponse(body);
                        finished();
                    } else {
                        next = '';
                        finished({ message: `Error by retrieving ${url}` } as any);
                    }
                });
        },
        () => next as any,
        (error) => {
            if (!error) {
                logger.log(`List of article ids to mirror completed for namespace "${namespace}"`);
            }
            finished(error && { message: `Unable to download article ids`, error });
        },
    );
}

function getArticleIdsForNamespaces() {
    return new Promise((resolve, reject) => {
        async.eachLimit(mw.namespacesToMirror, mw.namespacesToMirror.length, getArticleIdsForNamespace, (error) => {
            if (error) {
                reject(`Unable to get all article ids for in a namespace: ${error}`);
            } else {
                logger.log('All articles ids (but without redirect ids) for all namespaces were successfuly retrieved.');
                drainRedirectQueue(redirectQueue).then(resolve, reject);
            }
        });
    });
}