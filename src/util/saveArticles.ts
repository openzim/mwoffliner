import logger from '../Logger';
import Downloader from '../Downloader';
import MediaWiki from '../MediaWiki';
import { ZimArticle, ZimCreator } from '@openzim/libzim';
import htmlMinifier from 'html-minifier';
import * as QueryStringParser from 'querystring';

import pmap from 'p-map';
import DU from '../DOMUtils';
import * as domino from 'domino';
import { Dump } from '../Dump';
import { contains, genCanonicalLink, genHeaderCSSLink, genHeaderScript, getFullUrl, getMediaBase, jsPath } from '.';
import { config } from '../config';
import { footerTemplate, htmlTemplateCode } from '../Templates';
import { articleDetailXId, filesToDownloadXPath, filesToRetryXPath } from '../stores';
import { getRelativeFilePath, getSizeFromUrl, encodeArticleIdForZimHtmlUrl,
         interpolateTranslationString, isWebpCandidateImageUrl } from './misc';
import { RedisKvs } from './RedisKvs';
import { rewriteUrl } from './rewriteUrls';
import { CONCURRENCY_LIMIT, DELETED_ARTICLE_ERROR } from './const';

const genericJsModules = config.output.mw.js;
const genericCssModules = config.output.mw.css;

type FileStore = RedisKvs<{
    url: string;
    namespace?: string;
    mult?: number;
    width?: number;
}>;


export async function downloadFiles(fileStore: FileStore, zimCreator: ZimCreator, dump: Dump, downloader: Downloader, retryLater = true) {
    const filesForAttempt = await fileStore.len();
    const filesTotal = filesForAttempt + dump.status.files.success + dump.status.files.fail;

    logger.log(`${retryLater ? '' : 'RE-'}Downloading a total of [${retryLater ? filesTotal : filesForAttempt}] files...`);
    let prevPercentProgress: string;

    await fileStore.iterateItems(downloader.speed, async (fileDownloadPairs, workerId) => {
        logger.info(`Worker [${workerId}] processing batch of [${Object.keys(fileDownloadPairs).length}] files`);

        // todo align fileDownloadPairs and listOfArguments
        const listOfArguments = [];
        for (const [path, { url, namespace, mult, width }] of Object.entries(fileDownloadPairs)) {
            listOfArguments.push({ path, url, namespace, mult, width });
        }

        const responses = await downloadBulk(listOfArguments, downloader);
        for (const resp of responses) {
            let isFailed = false;
            try {
                if (resp.result && resp.result.content) {
                    const article = new ZimArticle({
                        url: resp.path,
                        data: resp.result.content,
                        ns: resp.namespace || 'I',
                        mimeType: resp.result.responseHeaders['content-type'],
                    });
                    zimCreator.addArticle(article);
                    dump.status.files.success += 1;
                } else {
                    isFailed = true;
                }
            } catch (err) {
                isFailed = true;
            } finally {
                if (isFailed) {
                    // todo don't queue 404 for retry
                    if (retryLater) {
                        await filesToRetryXPath.set(resp.path, { url: resp.url, namespace: resp.namespace, mult: resp.mult, width: resp.width });
                    } else {
                        logger.warn(`Error downloading file [${downloader.deserializeUrl(resp.url)}], skipping`);
                        dump.status.files.fail += 1;
                    }
                }
            }
            if ((dump.status.files.success + dump.status.files.fail) % 10 === 0) {
                const percentProgress = ((dump.status.files.success + dump.status.files.fail) / filesTotal * 100).toFixed(1);
                if (percentProgress !== prevPercentProgress) {
                    prevPercentProgress = percentProgress;
                    logger.log(`Progress downloading files [${dump.status.files.success + dump.status.files.fail}/${filesTotal}] [${percentProgress}%]`);
                }
            }
        }
    });

    if (retryLater) {
        const isThereAnythingToRetry = (await filesToRetryXPath.len()) > 0;
        if (isThereAnythingToRetry) {
            await downloadFiles(filesToRetryXPath, zimCreator, dump, downloader, false);
        } else {
            logger.log('No files to retry');
        }
    }

    logger.log(`Done with ${retryLater ? '' : 'RE-'}Downloading a total of [${retryLater ? filesTotal : filesForAttempt}] files`);
}

async function downloadBulk(listOfArguments: any[], downloader: Downloader): Promise<any> {
    try {
        // Enhance arguments array to have an index of the argument at hand
        const argsCopy = [].concat(listOfArguments.map((val, ind) => ({ val, ind })));
        const argList = [];

        while (argsCopy.length > 0) {
            const arg = argsCopy.shift();
            argList.push(arg);
        }
        return pmap(
            argList,
            async (arg) => {
                const resp: any = {};
                resp.path = arg.val.path;
                resp.url = arg.val.url;
                resp.namespace = arg.val.namespace;
                resp.mult = arg.val.mult;
                resp.width = arg.val.width;

                return downloader.downloadContent(arg.val.url).then((r) => {
                    resp.result = r;
                    resp.path += resp.result.responseHeaders.path_postfix || '';
                    return resp;
                }).catch((err) => {
                    return resp;
                });
            },
            { concurrency: CONCURRENCY_LIMIT }
        );
    } catch (err) {
        logger.log(`Not able download in bulk due to ${err}`);
    }
}

async function getAllArticlesToKeep(downloader: Downloader, mw: MediaWiki, dump: Dump) {
    await articleDetailXId.iterateItems(
        downloader.speed,
        async (articleKeyValuePairs) => {
            for (const [articleId] of Object.entries(articleKeyValuePairs)) {
                try {
                    const rets = await downloader.getArticle(articleId, dump);

                    for (const { articleId, html: articleHtml } of rets) {
                        if (!articleHtml) {
                            continue;
                        }

                        const doc = domino.createDocument(articleHtml);
                        if (!dump.isMainPage(articleId) && !await dump.customProcessor.shouldKeepArticle(articleId, doc)) {
                            articleDetailXId.delete(articleId);
                        }
                    }
                } catch (err) {
                    logger.warn(`Error downloading article [${articleId}], skipping`, err);
                    articleDetailXId.delete(articleId);
                }
            }
        }
    );
}

export async function saveArticles(zimCreator: ZimCreator, downloader: Downloader, mw: MediaWiki, dump: Dump) {
    const jsModuleDependencies = new Set<string>();
    const cssModuleDependencies = new Set<string>();
    let jsConfigVars = '';
    let prevPercentProgress: string;


    const articlesTotal = await articleDetailXId.len();

    if (dump.customProcessor?.shouldKeepArticle) {
        await getAllArticlesToKeep(downloader, mw, dump);
    }

    await articleDetailXId.iterateItems(
        downloader.speed,
        async (articleKeyValuePairs, workerId) => {
            logger.info(`Worker [${workerId}] processing batch of article ids [${logger.logifyArray(Object.keys(articleKeyValuePairs))}]`);
            for (const [articleId, articleDetail] of Object.entries(articleKeyValuePairs)) {
                try {
                    const rets = await downloader.getArticle(articleId, dump);

                    for (const { articleId, displayTitle: articleTitle, html: articleHtml } of rets) {
                        const nonPaginatedArticleId = articleDetail.title;
                        if (!articleHtml) {
                            logger.warn(`No HTML returned for article [${articleId}], skipping`);
                            continue;
                        }

                        const { articleDoc: _articleDoc, mediaDependencies, subtitles } = await processArticleHtml(articleHtml, downloader, mw, dump, articleId);
                        let articleDoc = _articleDoc;

                        if (!dump.isMainPage(articleId) && dump.customProcessor?.preProcessArticle) {
                            articleDoc = await dump.customProcessor.preProcessArticle(articleId, articleDoc);
                        }

                        for (const dep of mediaDependencies) {

                            const { mult, width } = getSizeFromUrl(dep.url);

                            const existingVal = await filesToDownloadXPath.get(dep.path);
                            const currentDepIsHigherRes = !existingVal || (existingVal.width < (width || 10e6)) || existingVal.mult < (mult || 1);
                            if (currentDepIsHigherRes) {
                                await filesToDownloadXPath.set(dep.path, { url: downloader.serializeUrl(dep.url), mult, width });
                            }
                        }

                        for (const subtitle of subtitles) {
                            await filesToDownloadXPath.set(subtitle.path, { url: subtitle.url, namespace: '-' });
                        }

                        const _moduleDependencies = await getModuleDependencies(nonPaginatedArticleId, mw, downloader);

                        for (const dep of _moduleDependencies.jsDependenciesList) {
                            jsModuleDependencies.add(dep);
                        }
                        for (const dep of _moduleDependencies.styleDependenciesList) {
                            cssModuleDependencies.add(dep);
                        }

                        jsConfigVars = jsConfigVars || _moduleDependencies.jsConfigVars;

                        let templatedDoc = await templateArticle(articleDoc, _moduleDependencies, mw, dump, articleId, articleDetail, downloader.webp);

                        if (dump.customProcessor && dump.customProcessor.postProcessArticle) {
                            templatedDoc = await dump.customProcessor.postProcessArticle(articleId, templatedDoc);
                        }

                        let outHtml = templatedDoc.documentElement.outerHTML;

                        if (dump.opts.minifyHtml) {
                            outHtml = htmlMinifier.minify(outHtml, {
                                removeComments: true,
                                conservativeCollapse: true,
                                collapseBooleanAttributes: true,
                                removeRedundantAttributes: true,
                                removeEmptyAttributes: true,
                                minifyCSS: true,
                            });
                        }

                        const finalHTML = `<!DOCTYPE html>\n` + outHtml;

                        const zimArticle = new ZimArticle({
                            url: articleId,
                            data: finalHTML,
                            ns: articleDetail.ns === 14 ? 'U' : 'A',
                            mimeType: 'text/html',
                            title: articleTitle,
                            shouldIndex: true,
                        });

                        zimCreator.addArticle(zimArticle);
                        dump.status.articles.success += 1;
                    }
                } catch (err) {
                    dump.status.articles.fail += 1;
                    logger.error(`Error downloading article ${articleId}`);
                    if ((!err.response || err.response.status !== 404) && err.message !== DELETED_ARTICLE_ERROR) {
                        throw err;
                    }
                }

                if ((dump.status.articles.success + dump.status.articles.fail) % 10 === 0) {
                    const percentProgress = ((dump.status.articles.success + dump.status.articles.fail) / articlesTotal * 100).toFixed(1);
                    if (percentProgress !== prevPercentProgress) {
                        prevPercentProgress = percentProgress;
                        logger.log(`Progress downloading articles [${dump.status.articles.success + dump.status.articles.fail}/${articlesTotal}] [${percentProgress}%]`);
                    }
                }
            }
        },
    );

    logger.log(`Done with downloading a total of [${articlesTotal}] articles`);

    const jsConfigVarArticle = new ZimArticle({ url: jsPath('jsConfigVars', config.output.dirs.mediawiki), data: jsConfigVars, ns: '-' });
    zimCreator.addArticle(jsConfigVarArticle);

    return {
        jsModuleDependencies,
        cssModuleDependencies,
    };
}

async function getModuleDependencies(articleId: string, mw: MediaWiki, downloader: Downloader) {

    /* These vars will store the list of js and css dependencies for
    the article we are downloading. */
    let jsConfigVars: string = '';
    let jsDependenciesList: string[] = [];
    let styleDependenciesList: string[] = [];

    const articleApiUrl = mw.articleApiUrl(articleId);
    const articleData = await downloader.getJSON<any>(articleApiUrl);

    /* Something went wrong in modules retrieval at app level (no HTTP error) */
    if (articleData.error) {
        logger.warn(`Unable to retrieve js/css dependencies for article '${articleId}': ${articleData.error.code}`);

        /* If article is missing (for example because it just has been deleted) */
        if (articleData.error.code === 'missingtitle') {
            return { jsConfigVars, jsDependenciesList, styleDependenciesList };
        }

        /* Other kind of error (unsupported) */
        process.exit(1);
    }

    const { parse: { modules, modulescripts, modulestyles, headhtml } } = articleData;
    jsDependenciesList = genericJsModules.concat(modules, modulescripts).filter((a) => a);
    styleDependenciesList = [].concat(modules, modulestyles, genericCssModules).filter((a) => a);
    styleDependenciesList = styleDependenciesList.filter(
        (oneStyleDep) => !contains(config.filters.blackListCssModules, oneStyleDep),
    );

    logger.info(`Js dependencies of ${articleId} : ${jsDependenciesList}`);
    logger.info(`Css dependencies of ${articleId} : ${styleDependenciesList}`);

    // Saving, as a js module, the jsconfigvars that are set in the header of a wikipedia page
    // the script below extracts the config with a regex executed on the page header returned from the api
    const scriptTags = domino.createDocument(`${headhtml['*']}</body></html>`).getElementsByTagName('script');
    const regex = /mw\.config\.set\(\{.*?\}\);/mg;
    // tslint:disable-next-line:prefer-for-of
    for (let i = 0; i < scriptTags.length; i += 1) {
        if (scriptTags[i].text.includes('mw.config.set')) {
            jsConfigVars = regex.exec(scriptTags[i].text)[0] || '';
        }
    }

    jsConfigVars = `(window.RLQ=window.RLQ||[]).push(function() {${jsConfigVars}});`;
    jsConfigVars = jsConfigVars.replace('nosuchaction', 'view'); // to replace the wgAction config that is set to 'nosuchaction' from api but should be 'view'

    return { jsConfigVars, jsDependenciesList, styleDependenciesList };
}

async function processArticleHtml(html: string, downloader: Downloader, mw: MediaWiki, dump: Dump, articleId: string) {
    let mediaDependencies: Array<{ url: string, path: string }> = [];
    let subtitles: Array<{ url: string, path: string }> = [];
    let doc = domino.createDocument(html);
    const tmRet = await treatMedias(doc, mw, dump, articleId, downloader);
    doc = tmRet.doc;

    mediaDependencies = mediaDependencies.concat(
        tmRet.mediaDependencies
            .filter((a) => a)
            .map((url) => {
                const path = getMediaBase(url, false);
                return { url, path };
            }),
    );

    subtitles = subtitles.concat(
        tmRet.subtitles
            .filter((a) => a)
            .map((url) => {
                const { title, lang } = QueryStringParser.parse(url) as { title: string, lang: string };
                const path = `${title}-${lang}.vtt`;
                return { url, path };
            }),
    );
    const ruRet = await rewriteUrls(doc, articleId, downloader, mw, dump);
    doc = ruRet.doc;
    mediaDependencies = mediaDependencies.concat(
        ruRet.mediaDependencies
            .filter((a) => a)
            .map((url) => {
                const path = getMediaBase(url, false);
                return { url, path };
            }),
    );
    doc = applyOtherTreatments(doc, dump);
    return {
        articleDoc: doc,
        mediaDependencies,
        subtitles
    };
}

export async function treatVideo(mw: MediaWiki, dump: Dump, srcCache: KVS<boolean>, articleId: string, videoEl: DominoElement, webp: boolean): Promise<{ mediaDependencies: string[], subtitles: string[] }> {

    /* Worth noting:
     - This function handles audio tags as well as video tags
     - Video tags are used for audio files too (as opposed to the audio tag)
     - When it's only audio, there will be a single OGG file
     - For video, we get multiple SOURCE tages with different resolutions */
    const mediaDependencies: string[] = [];
    const subtitles: string[] = [];

    /* Just delete video/audio element if the flavour requires it */
    if (dump.nopic || dump.novid || dump.nodet) {
        DU.deleteNode(videoEl);
        return { mediaDependencies, subtitles };
    }

    /* Firefox is not able to display correctly <video> nodes with a
     height < 40. In that case the controls are not displayed. */
    if (videoEl.getAttribute('height') && videoEl.getAttribute('height') < 40) {
        videoEl.setAttribute('height', '40');
    }

    /* Always show controls */
    videoEl.setAttribute('controls', '40');

    /* Choose best fiting resolution <source> video node */
    let videoSourceEls: any[] = Array.from(videoEl.children).filter((child: any) => child.tagName === 'SOURCE');
    const videoDisplayedWidth = Number(videoEl.getAttribute('width'));
    let bestWidthDiff = 424242;
    let chosenVideoSourceEl: DominoElement;
    videoSourceEls.forEach((videoSourceEl: DominoElement) => {

        // Ignore non-webm && non-audio sources
        const videoSourceType = videoSourceEl.getAttribute('type');
        if (!videoSourceEl.getAttribute('src').endsWith('.webm') &&
            !videoSourceType.startsWith('audio')) {
            DU.deleteNode(videoSourceEl);
            return;
        }

        // Handle audio content
        if (videoSourceType.startsWith('audio/ogg')) {
            chosenVideoSourceEl = videoSourceEl;
            return;
        } else if (videoSourceType.startsWith('audio')) {
            DU.deleteNode(videoSourceEl);
            return;
        }

        // If undefined displayed width, then take the best <source> resolution
        const videoSourceElWidth = Number(videoSourceEl.getAttribute('data-file-width') || videoSourceEl.getAttribute('data-width') || 0);
        if (!videoDisplayedWidth) {
            const chosenVideoSourceElWidth = chosenVideoSourceEl ?
                chosenVideoSourceEl.getAttribute('data-file-width') || chosenVideoSourceEl.getAttribute('data-width') || 0 : 0;
            if (videoSourceElWidth > chosenVideoSourceElWidth ||
                videoSourceElWidth == chosenVideoSourceElWidth && videoSourceEl.getAttribute('src').endsWith('.vp9.webm')) {
                DU.deleteNode(chosenVideoSourceEl);
                chosenVideoSourceEl = videoSourceEl;
                return;
            }
        }

        // Otherwise, choose <source> with better (smaller) width diff
        else {
            const widthDiff = Number(videoSourceElWidth - videoDisplayedWidth);

            // If no source has been picked so far, just take this one
            if (!chosenVideoSourceEl) {
                chosenVideoSourceEl = videoSourceEl;
                bestWidthDiff = widthDiff;
                return;
            }

            // Resolution of source is higher than displayed resolution
            else if (widthDiff >= 0) {
                if (bestWidthDiff < 0 ||
                    widthDiff < bestWidthDiff ||
                    (widthDiff === bestWidthDiff && videoSourceEl.getAttribute('src').endsWith('.vp9.webm'))) {
                        DU.deleteNode(chosenVideoSourceEl);
                        chosenVideoSourceEl = videoSourceEl;
                        bestWidthDiff = widthDiff;
                        return;
                }
            }

            // Resolution of source is smaller than displayed resolution
            else {
                if (widthDiff > bestWidthDiff ||
                    (widthDiff === bestWidthDiff && videoSourceEl.getAttribute('src').endsWith('.vp9.webm'))) {
                        DU.deleteNode(chosenVideoSourceEl);
                        chosenVideoSourceEl = videoSourceEl;
                        bestWidthDiff = widthDiff;
                        return;
                }
            }
        }

        // Delete all other nodes
        DU.deleteNode(videoSourceEl);
    });

    /* If no appropriate source video can be found, delete the video */
    if (!chosenVideoSourceEl) {
        logger.warn(`Unable to find an appropriate video/audio source for '${videoEl.resource}'`);
        DU.deleteNode(videoEl);
        return { mediaDependencies, subtitles };
    }

    /* Remove useless 'resource' attribute */
    videoEl.removeAttribute('resource');

    /* Handle video poster */
    const posterUrl = videoEl.getAttribute('poster');
    if (posterUrl) {
        const videoPosterUrl = getFullUrl(posterUrl, mw.baseUrl);
        const newVideoPosterUrl = getRelativeFilePath(articleId, getMediaBase(videoPosterUrl, true), 'I');

        if (posterUrl) {
           videoEl.setAttribute('poster',
               webp && isWebpCandidateImageUrl(newVideoPosterUrl) ?
                   newVideoPosterUrl + '.webp' : newVideoPosterUrl
           );
        }
        videoEl.removeAttribute('resource');

        if (!srcCache.hasOwnProperty(videoPosterUrl)) {
            srcCache[videoPosterUrl] = true;
            mediaDependencies.push(videoPosterUrl);
        }
    }

    /* Download content, but avoid duplicate calls */
    const sourceUrl = getFullUrl(chosenVideoSourceEl.getAttribute('src'), mw.baseUrl);
    if (!srcCache.hasOwnProperty(sourceUrl)) {
        srcCache[sourceUrl] = true;
        mediaDependencies.push(sourceUrl);
    }

    /* Set new URL for the video element */
    const fileBase = getMediaBase(sourceUrl, true);
    chosenVideoSourceEl.setAttribute('src', getRelativeFilePath(articleId, fileBase, 'I'));

    /* Scrape subtitle */
    for (const track of Array.from(videoEl.querySelectorAll('track'))) {
        subtitles.push(await treatSubtitle(track, mw, articleId));
    }

    return { mediaDependencies, subtitles };
}

export async function treatSubtitle(trackEle: DominoElement, mw: MediaWiki, articleId: string): Promise<string> {
    const subtitleSourceUrl = getFullUrl(trackEle.getAttribute('src'), mw.baseUrl);
    const { title, lang } = QueryStringParser.parse(subtitleSourceUrl) as { title: string, lang: string };
    // The source URL we get from Mediawiki article is in srt format, so we replace it to vtt which is standard subtitle trackformat for <track> src attribute.
    const vttFormatUrl = new URL(subtitleSourceUrl);
    vttFormatUrl.searchParams.set('trackformat', 'vtt');
    trackEle.setAttribute('src', `${getRelativeFilePath(articleId, title, '-')}-${lang}.vtt`);
    return vttFormatUrl.href;
}

function shouldKeepImage(dump: Dump, img: DominoElement) {
    const imageNodeClass = img.getAttribute('class') || '';
    const src = img.getAttribute('src');
    return (!dump.nopic
        || imageNodeClass.includes('mwe-math-fallback-image-inline')
        || img.getAttribute('typeof') === 'mw:Extension/math')
        && src
        && !src.includes('./Special:FilePath/');
}

async function treatImage(mw: MediaWiki, dump: Dump, srcCache: KVS<boolean>, articleId: string, img: DominoElement, downloader: Downloader): Promise<{ mediaDependencies: string[] }> {
    const mediaDependencies: string[] = [];

    if (!shouldKeepImage(dump, img)) {
        DU.deleteNode(img);
        return { mediaDependencies };
    }

    /* Remove image link */
    const linkNode = img.parentNode;
    if (linkNode.tagName === 'A') {
        /* Check if the target is mirrored */
        const href = linkNode.getAttribute('href') || '';
        const title = mw.extractPageTitleFromHref(href);
        const keepLink = title && await isMirrored(title);

        /* Under certain condition it seems that this is possible
                         * to have parentNode == undefined, in this case this
                         * seems preferable to remove the whole link+content than
                         * keeping a wrong link. See for example this url
                         * http://parsoid.wmflabs.org/ko/%EC%9D%B4%ED%9C%98%EC%86%8C */
        if (!keepLink) {
            if (linkNode.parentNode) {
                linkNode.parentNode.replaceChild(img, linkNode);
            } else {
                DU.deleteNode(img);
                return { mediaDependencies };
            }
        }
    }

    /* Rewrite image src attribute */
    const src = getFullUrl(img.getAttribute('src'), mw.baseUrl);
    let newSrc: string;
    try {
        const resourceNamespace = 'I';
        const slashesInUrl = articleId.split('/').length - 1;
        const upStr = '../'.repeat(slashesInUrl + 1);
        newSrc = `${upStr}${resourceNamespace}/` + getMediaBase(src, true);
        /* Download image, but avoid duplicate calls */
        if (!srcCache.hasOwnProperty(src)) {
            srcCache[src] = true;
            mediaDependencies.push(src);
        }

        /* Change image source attribute to point to the local image */
        img.setAttribute('src',
            downloader.webp && isWebpCandidateImageUrl(src) ?
                newSrc + '.webp': newSrc
        );

        /* Remove useless 'resource' attribute */
        img.removeAttribute('resource');

        /* Remove srcset */
        img.removeAttribute('srcset');
    } catch (err) {
        DU.deleteNode(img);
    }

    /* Add lazy loading */
    img.setAttribute('loading', 'lazy');

    return { mediaDependencies };
}

function isStillLinked(image: DominoElement) {
    return image && image.parentNode && image.parentNode.tagName === 'A';
}

function shouldKeepNode(dump: Dump, imageNode: DominoElement, image: DominoElement) {
    return !dump.nopic && imageNode && image;
}

function makeThumbDiv(dump: Dump, parsoidDoc: DominoElement, imageNode: DominoElement) {
    const imageNodeClass = imageNode.getAttribute('class') || '';
    let thumbDiv = parsoidDoc.createElement('div');
    thumbDiv.setAttribute('class', 'thumb');
    if (imageNodeClass.search('mw-halign-right') >= 0) {
        DU.appendToAttr(thumbDiv, 'class', 'tright');
    } else if (imageNodeClass.search('mw-halign-left') >= 0) {
        DU.appendToAttr(thumbDiv, 'class', 'tleft');
    } else if (imageNodeClass.search('mw-halign-center') >= 0) {
        DU.appendToAttr(thumbDiv, 'class', 'tnone');
        const centerDiv = parsoidDoc.createElement('center');
        centerDiv.appendChild(thumbDiv);
        thumbDiv = centerDiv;
    } else {
        const revAutoAlign = dump.mwMetaData.textDir === 'ltr' ? 'right' : 'left';
        DU.appendToAttr(thumbDiv, 'class', `t${revAutoAlign}`);
    }
    return thumbDiv;
}

function treatImageFrames(mw: MediaWiki, dump: Dump, parsoidDoc: DominoElement, imageNode: DominoElement) {
    const image = imageNode.getElementsByTagName('img')[0] || imageNode.getElementsByTagName('video')[0];

    if (!shouldKeepNode(dump, imageNode, image)) {
        DU.deleteNode(imageNode);
        return;
    }

    const descriptions = imageNode.getElementsByTagName('figcaption');
    const description = descriptions.length > 0 ? descriptions[0] : undefined;
    const imageWidth = parseInt(image.getAttribute('width'), 10);

    const thumbDiv = makeThumbDiv(dump, parsoidDoc, imageNode);

    const thumbinnerDiv = parsoidDoc.createElement('div');
    thumbinnerDiv.setAttribute('class', 'thumbinner');
    thumbinnerDiv.setAttribute('style', `width:${imageWidth + 2}px`);

    const thumbcaptionDiv = parsoidDoc.createElement('div');
    thumbcaptionDiv.setAttribute('class', 'thumbcaption');
    const autoAlign = dump.mwMetaData.textDir === 'ltr' ? 'left' : 'right';
    thumbcaptionDiv.setAttribute('style', `text-align: ${autoAlign}`);
    if (description) {
        thumbcaptionDiv.innerHTML = description.innerHTML;
    }

    thumbinnerDiv.appendChild(isStillLinked(image) ? image.parentNode : image);
    thumbinnerDiv.appendChild(thumbcaptionDiv);
    thumbDiv.appendChild(thumbinnerDiv);

    imageNode.parentNode.replaceChild(thumbDiv, imageNode);
}

export async function treatMedias(parsoidDoc: DominoElement, mw: MediaWiki, dump: Dump, articleId: string, downloader: Downloader) {
    let mediaDependencies: string[] = [];
    let subtitles: string[] = [];
    /* Clean/rewrite image tags */
    const imgs = Array.from(parsoidDoc.getElementsByTagName('img'));
    const videos: DominoElement = Array.from(parsoidDoc.querySelectorAll('video, audio'));
    const srcCache: KVS<boolean> = {};

    for (const videoEl of videos) { // <video /> and <audio />
        const ret = await treatVideo(mw, dump, srcCache, articleId, videoEl, downloader.webp);
        mediaDependencies = mediaDependencies.concat(ret.mediaDependencies);
        subtitles = subtitles.concat(ret.subtitles);
    }

    for (const imgEl of imgs) {
        const ret = await treatImage(mw, dump, srcCache, articleId, imgEl, downloader);
        mediaDependencies = mediaDependencies.concat(ret.mediaDependencies);
    }

    /* Improve image frames */
    const figures = parsoidDoc.getElementsByTagName('figure');
    const spans = parsoidDoc.querySelectorAll('span[typeof~=mw:Image/Frameless],span[typeof~=mw:File/Frameless]');
    const imageNodes = Array.prototype.slice.call(figures).concat(Array.prototype.slice.call(spans));
    for (const imageNode of imageNodes) {
        treatImageFrames(mw, dump, parsoidDoc, imageNode);
    }

    return { doc: parsoidDoc, mediaDependencies, subtitles };
}

async function rewriteUrls(parsoidDoc: DominoElement, articleId: string, downloader: Downloader, mw: MediaWiki, dump: Dump) {
    let mediaDependencies: string[] = [];
    /* Go through all links */
    const as = parsoidDoc.getElementsByTagName('a');
    const areas = parsoidDoc.getElementsByTagName('area');
    const linkNodes: DominoElement[] = Array.prototype.slice.call(as).concat(Array.prototype.slice.call(areas));

    await pmap(
        linkNodes,
        async (linkNode) => {
            const { mediaDependencies: mediaDeps } = await rewriteUrl(articleId, mw, dump, linkNode);
            mediaDependencies = mediaDependencies.concat(mediaDeps);
        },
        { concurrency: downloader.speed }
    );
    return { doc: parsoidDoc, mediaDependencies };
}

export function applyOtherTreatments(parsoidDoc: DominoElement, dump: Dump) {
    const filtersConfig = config.filters;

    /* Don't need <link> and <input> tags */
    const nodesToDelete: Array<{ class?: string, tag?: string, filter?: (n: any) => boolean }> = [{ tag: 'link' }, { tag: 'input' }];

    /* Remove "map" tags if necessary */
    if (dump.nopic) {
        nodesToDelete.push({ tag: 'map' });
    }

    /* Remove useless DOM nodes without children */
    function emptyChildFilter(n: any) {
        return !n.innerHTML;
    }
    nodesToDelete.push({ tag: 'li', filter: emptyChildFilter });
    nodesToDelete.push({ tag: 'span', filter: emptyChildFilter });

    /* Remove gallery boxes if pics need stripping of if it doesn't have thumbs */
    nodesToDelete.push({
        class: 'gallerybox',
        filter(n) {
            return !n.getElementsByTagName('img').length
                && !n.getElementsByTagName('audio').length
                && !n.getElementsByTagName('video').length;
        },
    });
    nodesToDelete.push({
        class: 'gallery',
        filter(n) {
            return !n.getElementsByClassName('gallerybox').length;
        },
    });

    /* Remove element with black listed CSS classes */
    filtersConfig.cssClassBlackList.forEach((classname: string) => {
        nodesToDelete.push({ class: classname });
    });

    if (dump.nodet) {
        filtersConfig.nodetCssClassBlackList.forEach((classname: string) => {
            nodesToDelete.push({ class: classname });
        });
    }

    /* Remove element with black listed CSS classes and no link */
    filtersConfig.cssClassBlackListIfNoLink.forEach((classname: string) => {
        nodesToDelete.push({
            class: classname,
            filter(n) {
                return n.getElementsByTagName('a').length === 0;
            },
        });
    });

    /* Delete them all */
    for (const t of nodesToDelete) {
        let nodes;
        if (t.tag) {
            nodes = parsoidDoc.getElementsByTagName(t.tag);
        } else if (t.class) {
            nodes = parsoidDoc.getElementsByClassName(t.class);
        } else {
            return; /* throw error? */
        }

        for (const node of Array.from(nodes)) {
            if (!t.filter || t.filter(node)) {
                DU.deleteNode(node);
            }
        }
    }

    /* Go through all reference calls */
    const spans: DominoElement[] = Array.from(parsoidDoc.getElementsByTagName('span'));
    for (const span of spans) {
        const rel = span.getAttribute('rel');
        if (rel === 'dc:references') {
            const sup = parsoidDoc.createElement('sup');
            if (span.innerHTML) {
                sup.id = span.id;
                sup.innerHTML = span.innerHTML;
                span.parentNode.replaceChild(sup, span);
            } else {
                DU.deleteNode(span);
            }
        }
    }

    /* Remove element with id in the blacklist */
    filtersConfig.idBlackList.forEach((id) => {
        const node = parsoidDoc.getElementById(id);
        if (node) {
            DU.deleteNode(node);
        }
    });

    /* Force display of element with that CSS class */
    filtersConfig.cssClassDisplayList.map((classname: string) => {
        const nodes: DominoElement[] = Array.from(parsoidDoc.getElementsByClassName(classname));
        for (const node of nodes) {
            node.style.removeProperty('display');
        }
    });

    /* Remove empty paragraphs */
    if (!dump.opts.keepEmptyParagraphs) {
        // Mobile view === details
        // Desktop view === section
        const sections: DominoElement[] = Array.from(parsoidDoc.querySelectorAll('details, section'));
        for (const section of sections) {
            if (section.children.length === Array.from(section.children).filter((child: DominoElement) => {return child.matches('summary')}).length) {
                DU.deleteNode(section);
            }
        }
    }

    /* Clean the DOM of all uncessary code */
    const allNodes: DominoElement[] = Array.from(parsoidDoc.getElementsByTagName('*'));
    for (const node of allNodes) {
        node.removeAttribute('data-parsoid');
        node.removeAttribute('typeof');
        node.removeAttribute('about');
        node.removeAttribute('data-mw');

        if (node.getAttribute('rel') && node.getAttribute('rel').substr(0, 3) === 'mw:') {
            node.removeAttribute('rel');
        }

        /* Remove a few images Parsoid attributes */
        else if (node.getAttribute('img')) {
            node.removeAttribute('data-file-width');
            node.removeAttribute('data-file-height');
            node.removeAttribute('data-file-type');
        }

        /* Remove a few css calls */
        filtersConfig.cssClassCallsBlackList.map((classname: string) => {
            if (node.getAttribute('class')) {
                node.setAttribute('class', node.getAttribute('class').replace(classname, ''));
            }
        });

    }

    const kartographerMaplinkNodes = Array.from<DominoElement>(parsoidDoc.querySelectorAll('.mw-kartographer-maplink'))
        .filter((n) => !!n.textContent);
    for (const node of kartographerMaplinkNodes) {
        node.textContent = '🌍';
    }

    return parsoidDoc;
}

async function templateArticle(parsoidDoc: DominoElement, moduleDependencies: any, mw: MediaWiki, dump: Dump, articleId: string, articleDetail: ArticleDetail, webp: boolean): Promise<Document> {
    const {
        jsConfigVars,
        jsDependenciesList,
        styleDependenciesList,
    } = moduleDependencies as {
        jsConfigVars: string | RegExpExecArray,
        jsDependenciesList: string[],
        styleDependenciesList: string[],
    };

    const htmlTemplateDoc = domino.createDocument(
        htmlTemplateCode(articleId)
            .replace('__ARTICLE_CANONICAL_LINK__', genCanonicalLink(config, mw.webUrl.href, articleId))
            .replace('__ARTICLE_CONFIGVARS_LIST__', jsConfigVars !== '' ? genHeaderScript(config, 'jsConfigVars', articleId, config.output.dirs.mediawiki) : '')
            .replace(
                '__ARTICLE_JS_LIST__',
                jsDependenciesList.length !== 0
                    ? jsDependenciesList.map((oneJsDep) => genHeaderScript(config, oneJsDep, articleId, config.output.dirs.mediawiki)).join('\n')
                    : '',
            )
            .replace(
                '__ARTICLE_CSS_LIST__',
                styleDependenciesList.length !== 0
                    ? styleDependenciesList.map((oneCssDep) => genHeaderCSSLink(config, oneCssDep, articleId, config.output.dirs.mediawiki)).join('\n')
                    : '',
            )
            .replace('__ARTICLE_ID__', `<script>let articleId = '${articleId}'</script>`),
    );

    /* Create final document by merging template and parsoid documents */
    htmlTemplateDoc.getElementById('mw-content-text').style.setProperty('direction', dump.mwMetaData.textDir);
    htmlTemplateDoc.getElementById('mw-content-text').innerHTML = parsoidDoc.getElementsByTagName('body')[
        0
    ].innerHTML;

    /* Title */
    htmlTemplateDoc.getElementsByTagName('title')[0].innerHTML = htmlTemplateDoc.getElementById('title_0')
        ? htmlTemplateDoc.getElementById('title_0').textContent
        : articleId.replace(/_/g, ' ');
    DU.deleteNode(htmlTemplateDoc.getElementById('titleHeading'));

    /* Subpage */
    if (isSubpage(articleId, mw) && !dump.isMainPage(articleId)) {
        const headingNode = htmlTemplateDoc.getElementById('mw-content-text');
        const subpagesNode = htmlTemplateDoc.createElement('span');
        const parents = articleId.split('/');
        parents.pop();
        let subpages = '';
        await Promise.all(
            parents.map(async (parent) => {
                const label = parent.replace(/_/g, ' ');
                const isParentMirrored = await isMirrored(`${articleId.split(parent)[0]}${parent}`);
                subpages
                    += `&lt; ${
                    isParentMirrored
                        ? `<a href="${'../'.repeat(parents.length)}${encodeArticleIdForZimHtmlUrl(`${articleId.split(parent)[0]}${parent}`)}" title="${label}">`
                        : ''
                    }${label
                    }${isParentMirrored ? '</a> ' : ' '}`;
            }),
        );
        subpagesNode.innerHTML = subpages;
        subpagesNode.setAttribute('class', 'subpages');
        headingNode.parentNode.insertBefore(subpagesNode, headingNode);
    }

    /* Set footer */
    const div = htmlTemplateDoc.createElement('div');

    /* Revision date */
    const date = new Date(articleDetail.timestamp);
    const lastEditedOnString = date ?
        interpolateTranslationString(dump.strings.LAST_EDITED_ON, {
            date: date.toISOString().substring(0, 10),
        }) : null;

    const creatorLink =
        `<a class="external text" ` +
        `${lastEditedOnString ? `title="${lastEditedOnString}"` : ''} ` +
        `href="${mw.webUrl.href}?title=${encodeURIComponent(articleId)}&oldid=${articleDetail.revisionId}">` +
        `${dump.mwMetaData.creator}</a>`;

    const licenseLink =
        `<a class="external text" href="https://creativecommons.org/licenses/by-sa/4.0/">${dump.strings.LICENSE_NAME}</a>`;

    div.innerHTML = footerTemplate({
        disclaimer: interpolateTranslationString(dump.strings.DISCLAIMER, {
            creator: creatorLink,
            license: licenseLink,
        }),
        strings: dump.strings,
    });
    htmlTemplateDoc.getElementById('mw-content-text').appendChild(div);
    addNoIndexCommentToElement(div);

    /* Geo-coordinates */
    if (articleDetail.coordinates) {
        const geoCoordinates = articleDetail.coordinates;
        const metaNode = htmlTemplateDoc.createElement('meta');
        metaNode.name = 'geo.position';
        metaNode.content = geoCoordinates;
        htmlTemplateDoc.getElementsByTagName('head')[0].appendChild(metaNode);
    }

    return htmlTemplateDoc;
}

function addNoIndexCommentToElement(element: DominoElement) {
    const slices = element.parentElement.innerHTML.split(element.outerHTML);
    element.parentElement.innerHTML = `${slices[0]}<!--htdig_noindex-->${element.outerHTML}<!--/htdig_noindex-->${slices[1]}`;
}

function isSubpage(id: string, mw: MediaWiki) {
    if (id && id.indexOf('/') >= 0) {
        const namespace = id.indexOf(':') >= 0 ? id.substring(0, id.indexOf(':')) : '';
        const ns = mw.namespaces[namespace]; // namespace already defined
        if (ns !== undefined) {
            return ns.allowedSubpages;
        }
    }
    return false;
}

export function isMirrored(id: string) {
    return articleDetailXId.get(id);
}
