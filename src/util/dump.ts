import urlParser from 'url';
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
import fs from 'fs'

export async function getAndProcessStylesheets(downloader: Downloader, links: Array<string | DominoElement>) {
    let finalCss = '';
    const stylesheetQueue = async.queue(async (link: string | DominoElement, finished) => {
        const cssUrl = typeof link === 'object' ? getFullUrl(link.getAttribute('href'), downloader.mw.baseUrl) : link;
        const linkMedia = typeof link === 'object' ? link.getAttribute('media') : null;
        try {
            /* link might be a 'link' DOM node or an URL */

            if (cssUrl && !cssUrl.match('^data')) {
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
                            url = getFullUrl(url, cssUrl);
                            url = url.indexOf('%') < 0 ? encodeURI(url) : url;

                            /* Download CSS dependency, but avoid duplicate calls */
                            if (!downloader.cssDependenceUrls.hasOwnProperty(url) && filename) {
                                downloader.cssDependenceUrls[url] = true;
                                filesToDownloadXPath.set(config.output.dirs.mediawiki + '/' + filename, { url: downloader.serializeUrl(url), namespace: '-' });
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
            logger.warn(`Failed to get CSS from [${cssUrl}]`);
            finished();
        }
    }, Number(downloader.speed));

    stylesheetQueue.push(links);

    return new Promise((resolve: any, reject) => {
        stylesheetQueue.drain(resolve);
    }).then(() => {
        return {
            finalCss,
        };
    });
}

export async function downloadAndSaveModule(zimCreator: ZimCreator, mw: MediaWiki, downloader: Downloader, dump: Dump, module: string, type: 'js' | 'css') {
    // param :
    //   module : string : the name of the module
    //   moduleUri : string : the path where the module will be saved into the zim
    //   type : string : either 'js' or 'css'
    // this function save a key into Redis db in the form of module.type -> moduleUri
    // return :
    //   a promise resolving 1 if data has been succesfully saved or resolving 0 if data was already in Redis

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
        ).replace('function allReady( modules ) {', 'function allReady( modules ) { return true;');
    }
    function hackMediaWikiModule(jsCode: string) {
        return `mwObj = { ${jsCode.split('\n').slice(1, -4).join('\n')} } mwObj["files"]["mediawiki.base.js"]( (fileName) => { return mwObj["files"][fileName.split('/')[1]]; } , false);`;
    }
    function hackSiteModule(jsCode: string){
        return `${jsCode.replace('$Tables.each', '$Tables.forEach').replace('$( this )', '$( table )').replace('i, table', 'table, i')} collapsibleTables($);`;
    }

    let apiParameterOnly;
    if (type === 'js') {
        apiParameterOnly = 'scripts';
    } else if (type === 'css') {
        apiParameterOnly = 'styles';
    }

    const moduleApiUrl = encodeURI(
        `${mw.modulePath}debug=true&lang=en&modules=${module}&only=${apiParameterOnly}&skin=vector&version=&*`,
    );
    logger.info(`Getting [${type}] module [${moduleApiUrl}]`);

    const { content } = await downloader.downloadContent(moduleApiUrl);
    let text = content.toString();
    if (module === 'startup' && type === 'js') {
        text = hackStartUpModule(text);
    } else if (module === 'mediawiki.base' && type === 'js') {
        text = hackMediaWikiModule(text);
    } else if (module === 'site' && type === 'js') {
        text = hackSiteModule(text);
    }

    try {
        const articleId = type === 'js'
            ? jsPath(module, config.output.dirs.mediawiki)
            : cssPath(module, config.output.dirs.mediawiki);
        const article = new ZimArticle({ url: articleId, data: text, ns: '-' });
        zimCreator.addArticle(article);
        logger.info(`Saved module [${module}]`);
    } catch (e) {
        logger.error(`Failed to get module with url [${moduleApiUrl}]\nYou may need to specify a custom --mwModulePath`, e);
        throw e;
    }
}

// URLs should be kept the same as Kiwix JS relies on it.
export async function importPolyfillModules(zimCreator: ZimCreator) {
    [
        { name: 'webpHeroPolyfill', path: 'webp-hero/dist-cjs/polyfills.js' },
        { name: 'webpHeroBundle',   path: 'webp-hero/dist-cjs/webp-hero.bundle.js' }
    ].forEach( ({name, path}) => {
        const article = new ZimArticle({
            url: jsPath(name),
            data: fs.readFileSync(require.resolve(path), 'utf8').toString(),
            ns: '-'
        });
        zimCreator.addArticle(article);
    });
}