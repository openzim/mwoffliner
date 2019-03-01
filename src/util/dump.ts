import * as urlParser from 'url';
import * as pathParser from 'path';
import async from 'async';
import logger from '../Logger';
import Downloader from '../Downloader';
import { getFullUrl, jsPath, cssPath } from '.';
import { config } from '../config';
import MediaWiki from '../MediaWiki';
import { ZimCreator, ZimArticle } from '@openzim/libzim';
import Redis from '../redis';
import { Dump } from '../Dump';

export async function getArticleThumbnails(downloader: Downloader, mw: MediaWiki, articleList: string[]) {
    logger.info(`Getting article thumbnails`);
    let articleIndex = 0;
    const thumbnailsToDownload = [];

    while (articleIndex < articleList.length - 1 && thumbnailsToDownload.length < 100) {
        try {
            const webUrlHost = urlParser.parse(downloader.mw.webUrl).host;
            const articleId = articleList[articleIndex];
            const resp = await downloader.queryArticleThumbnail(articleId);
            const page = resp.query.pages[Object.keys(resp.query.pages)[0]];
            const imageUrl = getFullUrl(webUrlHost, page.thumbnail.source);
            const id = page.title.replace(/ /g, mw.spaceDelimiter);
            thumbnailsToDownload.push({ articleId: id, imageUrl });
        } catch (err) { /* NOOP */ }
        articleIndex += 1;
    }

    return thumbnailsToDownload;
}

export async function getAndProcessStylesheets(downloader: Downloader, links: Array<string | DominoElement>) {
    const mediaItemsToDownload: Array<{ url: string, path: string }> = [];
    let finalCss = '';
    const urlCache: KVS<boolean> = {};
    const webUrlHost = urlParser.parse(downloader.mw.webUrl).host;

    const stylesheetQueue = async.queue(async (link: string | DominoElement, finished) => {
        try {
            /* link might be a 'link' DOM node or an URL */
            const cssUrl = typeof link === 'object' ? getFullUrl(webUrlHost, link.getAttribute('href')) : link;
            const linkMedia = typeof link === 'object' ? link.getAttribute('media') : null;

            if (cssUrl) {
                const cssUrlRegexp = new RegExp('url\\([\'"]{0,1}(.+?)[\'"]{0,1}\\)', 'gi');

                logger.info(`Downloading CSS from ${decodeURI(cssUrl)}`);
                const { content } = await downloader.downloadContent(cssUrl);
                const body = content.toString();

                let rewrittenCss = `\n/* start ${cssUrl} */\n\n`;
                rewrittenCss += linkMedia ? `@media ${linkMedia}  {\n` : '\n';
                rewrittenCss += `${body}\n`;
                rewrittenCss += linkMedia ? `} /* @media ${linkMedia} */\n` : '\n';
                rewrittenCss += `\n/* end   ${cssUrl} */\n`;

                /* Downloading CSS dependencies */
                let match;
                // tslint:disable-next-line:no-conditional-assignment
                while ((match = cssUrlRegexp.exec(body))) {
                    let url = match[1];

                    /* Avoid 'data', so no url dependency */
                    if (!url.match('^data')) {
                        const filePathname = urlParser.parse(url, false, true).pathname;
                        if (filePathname) {
                            const filename = pathParser.basename(filePathname).replace(/-.*x./, '.');

                            /* Rewrite the CSS */
                            rewrittenCss = rewrittenCss.replace(url, filename);

                            /* Need a rewrite if url doesn't include protocol */
                            url = getFullUrl(webUrlHost, url, cssUrl);
                            url = url.indexOf('%') < 0 ? encodeURI(url) : url;

                            /* Download CSS dependency, but avoid duplicate calls */
                            if (!urlCache.hasOwnProperty(url) && filename) {
                                urlCache[url] = true;
                                mediaItemsToDownload.push({ url, path: config.output.dirs.style + '/' + filename });
                            }
                        } else {
                            logger.warn(`Skipping CSS [url(${url})] because the pathname could not be found [${filePathname}]`);
                        }
                    }
                }
                finalCss += rewrittenCss;
                finished();
            }
        } catch (err) {
            finished(err);
        }
    }, Number(downloader.speed));

    stylesheetQueue.push(links);

    return new Promise((resolve, reject) => {
        stylesheetQueue.drain = resolve;
    }).then(() => {
        return {
            finalCss,
            mediaItemsToDownload,
        };
    });
}

export function removeDuplicatesAndLowRes(items: Array<{ url: string, path: string, namespace: string }>) {
    items = items.sort((a, b) => {
        return a.url.localeCompare(b.url);
    });

    const uniqueItems = items.filter((it, index, arr) => {
        if (index >= arr.length - 1) {
            return true;
        }
        return it.path !== arr[index + 1].path;
    });

    const itemsWithHighestRequiredRes = uniqueItems.map((it) => {
        const similarItems = items.filter((item) => item.path === it.path);

        // const uniqueNamespaces = items.map((it) => it.namespace).sort().filter((it, i, arr) => it !== arr[i + 1]);
        // This de-dup could cause issues if the duplicate files are in different namespaces, ignoring for now.

        const itemsWithMult = similarItems.map((item) => {
            const hasMult = item.url.includes('x.');
            let multiplier = '1x';
            if (hasMult) {
                multiplier = item.url.split('-').slice(-1)[0].split('.').slice(0, -1).join('.'); // e.g. "1.5x"
            }

            const mult = Number(multiplier.slice(0, -1));

            return {
                ...item,
                mult,
            };
        });

        const itemsSortedByMult = itemsWithMult.sort((a, b) => a.mult < b.mult ? 1 : -1);
        return itemsSortedByMult[0];
    });

    logger.info(`Not downloading [${items.length - itemsWithHighestRequiredRes.length}] low-res images`);
    return itemsWithHighestRequiredRes;
}

export function downloadAndSaveModule(zimCreator: ZimCreator, redis: Redis, mw: MediaWiki, downloader: Downloader, dump: Dump, module: string, type: 'js' | 'css') {
    // param :
    //   module : string : the name of the module
    //   moduleUri : string : the path where the module will be saved into the zim
    //   type : string : either 'js' or 'css'
    // this function save a key into redis db in the form of module.type -> moduleUri
    // return :
    //   a promise resolving 1 if data has been succesfully saved or resolving 0 if data was already in redis

    // the 2 variable functions below are a hack to call startUp() (from module startup) when the 3 generic dependencies (startup, jquery, mediawiki) are loaded.
    // on wikipedia, startUp() is called in the callback of the call to load.php to dl jquery and mediawiki but since load.php cannot be called in offline,
    // this hack calls startUp() when custom event fireStartUp is received. Which is dispatched when module mediawiki has finished loading
    function hackStartUpModule(jsCode: string) {
        return jsCode.replace(
            'script=document.createElement(\'script\');',
            `
                    document.body.addEventListener('fireStartUp', function () { startUp() }, false);
                    return;
                    script=document.createElement('script');`,
        );
    }
    function hackMediaWikiModule(jsCode: string) {
        jsCode += `(function () {
            const startUpEvent = new CustomEvent('fireStartUp');
            document.body.dispatchEvent(startUpEvent);
        })()`;
        return jsCode;
    }

    let moduleUri: string;
    let apiParameterOnly;
    if (type === 'js') {
        moduleUri = pathParser.resolve(dump.opts.tmpDir, jsPath(config, module));
        apiParameterOnly = 'scripts';
    } else if (type === 'css') {
        moduleUri = pathParser.resolve(dump.opts.tmpDir, cssPath(config, module));
        apiParameterOnly = 'styles';
    }

    const moduleApiUrl = encodeURI(
        `${mw.modulePath}debug=false&lang=en&modules=${module}&only=${apiParameterOnly}&skin=vector&version=&*`,
    );
    logger.info(`Getting [${type}] module [${moduleApiUrl}]`);
    return redis.saveModuleIfNotExists(dump, module, moduleUri, type)
        .then(async (redisResult) => {
            if (redisResult === 1) {
                const { content } = await downloader.downloadContent(moduleApiUrl);
                let text = content.toString();
                if (module === 'startup' && type === 'js') {
                    text = hackStartUpModule(text);
                } else if (module === 'mediawiki' && type === 'js') {
                    text = hackMediaWikiModule(text);
                }

                try {
                    const articleId = type === 'js'
                        ? jsPath(config, module)
                        : cssPath(config, module);
                    const article = new ZimArticle({ url: articleId, data: text, ns: '-' });
                    await zimCreator.addArticle(article);
                    logger.info(`created dep ${module} for article ${articleId}`);
                } catch (e) {
                    logger.warn(`Error writing file ${moduleUri} ${e}`);
                }
            } else {
                return Promise.resolve();
            }
        })
        .catch((e) => {
            logger.error(`Failed to get module with url [${moduleApiUrl}]\nYou may need to specify a custom --mwModulePath`, e);
        });
}
