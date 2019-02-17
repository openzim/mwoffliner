import * as urlParser from 'url';
import * as pathParser from 'path';
import async from 'async';
import logger from '../Logger';
import Downloader from '../Downloader';
import { getFullUrl } from '.';
import { config } from '../config';
import MediaWiki from '../MediaWiki';

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

export function removeDuplicatesAndLowRes(items: Array<{ url: string, path: string }>) {
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
