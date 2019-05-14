import * as urlParser from 'url';
import * as pathParser from 'path';
import async from 'async';
import logger from '../Logger';
import Downloader from '../Downloader';
import { getFullUrl, jsPath, cssPath } from '.';
import { config } from '../config';
import MediaWiki from '../MediaWiki';
import { ZimCreator, ZimArticle } from '@openzim/libzim';
import { Dump } from '../Dump';
import { filesToDownloadXPath } from '../stores';

export async function getAndProcessStylesheets(downloader: Downloader, links: Array<string | DominoElement>) {
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
                                filesToDownloadXPath.set(config.output.dirs.style + '/' + filename, { url, namespace: '-' });
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
        };
    });
}

export function removeDuplicatesAndLowRes(items: Array<{ url: string, path: string, namespace: string }>) {
    const m = new Map();
    items.map((it) => {
        let mult = 1;
        let width = 1 * 10e6; // dummy value for unscaled media
        const widthMatch = it.url.match(/\/([0-9]+)px-/);
        if (widthMatch) {
            width = Number(widthMatch[1]);
        } else {
            const multMatch = it.url.match(/-([0-9.]+)x\./);
            if (multMatch) {
                mult = Number(multMatch[1]);
            }
        }

        const e = m.get(it.path);
        if (e === undefined) {
            m.set(it.path, { ...it, mult, width });
        } else if (e.width < width || e.mult < mult) {
            m.set(it.path, { ...it, mult, width });
        }
    });
    const itemsWithHighestRequiredRes = Array.from(m.values());

    logger.info(`Not downloading [${items.length - itemsWithHighestRequiredRes.length}] low-res images`);
    return itemsWithHighestRequiredRes;
}

export async function downloadAndSaveModule(zimCreator: ZimCreator, mw: MediaWiki, downloader: Downloader, dump: Dump, module: string, type: 'js' | 'css') {
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

    let apiParameterOnly;
    if (type === 'js') {
        apiParameterOnly = 'scripts';
    } else if (type === 'css') {
        apiParameterOnly = 'styles';
    }

    const moduleApiUrl = encodeURI(
        `${mw.modulePath}debug=false&lang=en&modules=${module}&only=${apiParameterOnly}&skin=vector&version=&*`,
    );
    logger.info(`Getting [${type}] module [${moduleApiUrl}]`);

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
        logger.info(`Saved module [${module}]`);
    } catch (e) {
        logger.error(`Failed to get module with url [${moduleApiUrl}]\nYou may need to specify a custom --mwModulePath`, e);
        throw e;
    }
}
