/* ********************************** */
/* MODULE VARIABLE SECTION ********** */
/* ********************************** */

import async from 'async';
import { exec } from 'child_process';
import crypto from 'crypto';
import domino from 'domino';
import fs from 'fs';
import os from 'os';
import pathParser from 'path';
import urlParser from 'url';
import zlib from 'zlib';
import semver from 'semver';
import * as path from 'path';
import axios from 'axios';
import { ZimCreator, ZimArticle } from 'libzim-binding';
import homeDirExpander from 'expand-home-dir';
import rimraf from 'rimraf';

import { config } from './config';
import Downloader from './Downloader';
import MediaWiki from './MediaWiki';
import parameterList from './parameterList';
import Redis from './redis';
import { writeFilePromise, getStringsForLang, mkdirPromise, isValidEmail, genHeaderCSSLink, genHeaderScript, saveStaticFiles, jsPath, cssPath, getFullUrl, migrateChildren, touch, readFilePromise, makeArticleImageTile, makeArticleListItem, getDumps, mapLimit, MEDIA_REGEX, getMediaBase, MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE } from './util';
import packageJSON from '../package.json';
import { ZimCreatorFs } from './ZimCreatorFs';
import logger from './Logger';
import { getArticleThumbnails, getAndProcessStylesheets } from './util';
import { Dump } from './Dump';
import { getArticleIds, drainRedirectQueue } from './util/redirects';
import { redirectTemplate, articleListHomeTemplate } from './Templates';
import { saveArticles } from './util/saveArticles';

function getParametersList() {
  // Want to remove this anonymous function. Need to investigate to see if it's needed
  return parameterList;
}

async function execute(argv: any) {
  /* ********************************* */
  /* CUSTOM VARIABLE SECTION ********* */
  /* ********************************* */

  const {
    speed: _speed,
    adminEmail,
    verbose,
    minifyHtml,
    skipCacheCleaning,
    keepEmptyParagraphs,
    mwUrl,
    mwWikiPath,
    mwApiPath,
    mwModulePath,
    mwDomain,
    mwUsername,
    mwPassword,
    requestTimeout,
    customMainPage,
    customZimTitle,
    customZimDescription,
    customZimTags,
    withoutZimFullTextIndex,
    format,
    filenamePrefix,
    resume,
    deflateTmpHtml,
    keepHtml: keepHtml,
    publisher: _publisher,
    outputDirectory: _outputDirectory,
    cacheDirectory: _cacheDirectory,
    tmpDirectory: _tmpDirectory,
    addNamespaces: _addNamespaces,
    articleList: _articleList,
    customZimFavicon: _customZimFavicon,
    useCache,
  } = argv;

  process.env.verbose = verbose;

  let articleList = _articleList ? String(_articleList) : _articleList;
  const publisher = _publisher || config.defaults.publisher;
  let customZimFavicon = _customZimFavicon;

  const outputDirectory = _outputDirectory ? `${homeDirExpander(_outputDirectory)}/` : 'out/';
  const cacheDirectory = _cacheDirectory ? `${homeDirExpander(_cacheDirectory)}/` : 'cac/';
  const tmpDirectory = _tmpDirectory ? `${homeDirExpander(_tmpDirectory)}/` : 'tmp/';

  /* HTTP user-agent string */
  // const adminEmail = argv.adminEmail;
  if (!isValidEmail(adminEmail)) { throw new Error(`Admin email [${adminEmail}] is not valid`); }

  /* Number of parallel requests */
  if (_speed && isNaN(_speed)) { throw new Error('speed is not a number, please give a number value to --speed'); }
  const cpuCount = os.cpus().length;
  const speed = cpuCount * (_speed || 1);

  /* Necessary to avoid problems with https */
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const nodeVersionSatisfiesPackage = semver.satisfies(process.version, packageJSON.engines.node);
  if (!nodeVersionSatisfiesPackage) {
    logger.warn(`***********\n\n\tCurrent node version is [${process.version}]. We recommend [${packageJSON.engines.node}]\n\n***********`);
  }

  /* Wikipedia/... URL; Normalize by adding trailing / as necessary */
  const mw = new MediaWiki({
    apiPath: mwApiPath,
    modulePath: mwModulePath,
    base: mwUrl,
    domain: mwDomain,
    password: mwPassword,
    spaceDelimiter: '_',
    username: mwUsername,
    wikiPath: mwWikiPath,
  });

  /* Download helpers; TODO: Merge with something else / expand this. */
  const downloader = new Downloader(
    mw,
    `${config.userAgent} (${adminEmail})`,
    speed,
    requestTimeout || config.defaults.requestTimeout,
  );

  /* Get MediaWiki Info */
  const mwMetaData = await mw.getMwMetaData(downloader);

  const MCSMainPageQuery = await downloader.getJSON<any>(`${downloader.mcsUrl}${mwMetaData.mainPage}`);
  const useLocalMCS = !MCSMainPageQuery.lead;

  if (useLocalMCS) {
    logger.log(`Using a local MCS instance, couldn't find a remote one`);
    await downloader.initLocalMcs();
  }

  const mainPage = customMainPage || articleList ? '' : mwMetaData.mainPage;

  /* Get language specific strings */
  const strings = getStringsForLang(mwMetaData.langIso2 || 'en', 'en');

  /* *********************************** */
  /*       SYSTEM VARIABLE SECTION       */
  /* *********************************** */

  const dumps = getDumps(format);

  const INFINITY_WIDTH = 9999999;
  const addNamespaces = _addNamespaces ? String(_addNamespaces).split(',').map((a: string) => Number(a)) : [];

  const dumpId = `mwo-dump-${Date.now()}`;
  const dumpTmpDir = path.resolve(tmpDirectory, `${dumpId}`);
  try {
    logger.info(`Creating dump temporary directory [${dumpTmpDir}]`);
    await mkdirPromise(dumpTmpDir);
  } catch (err) {
    logger.error(`Failed to create dump temporary directory, exiting`, err);
    throw err;
  }

  process.on('exit', () => {
    logger.log(`Deleting tmp dump dir [${dumpTmpDir}]`);
    rimraf.sync(dumpTmpDir);
  });

  /* ZIM custom Favicon */
  if (customZimFavicon) {
    const faviconPath = path.join(dumpTmpDir, 'favicon.png');
    const faviconIsRemote = customZimFavicon.includes('http');
    logger.log(`${faviconIsRemote ? 'Downloading' : 'Moving'} custom favicon to [${faviconPath}]`);
    let content;
    if (faviconIsRemote) {
      logger.log(`Downloading remote zim favicon from [${customZimFavicon}]`);
      content = await axios.get(customZimFavicon, { responseType: 'arraybuffer' })
        .then((a) => a.data)
        .catch((err) => {
          throw new Error(`Failed to download custom zim favicon from [${customZimFavicon}]`);
        });
    } else {
      try {
        content = fs.readFileSync(customZimFavicon);
      } catch (err) {
        throw new Error(`Failed to read custom zim favicon from [${customZimFavicon}]`);
      }
    }
    fs.writeFileSync(faviconPath, content);
    customZimFavicon = faviconPath;

    if (!fs.existsSync(customZimFavicon)) { throw new Error(`Path ${customZimFavicon} is not a valid PNG file.`); }
  }

  /* ********************************* */
  /* RUNNING CODE ******************** */
  /* ********************************* */

  // await checkDependencies(env);

  /* Setup redis client */
  const redis = new Redis(argv, config);

  /* ********************************* */
  /* MEDIA RELATED QUEUES ************ */
  /* ********************************* */

  /* Setting up the downloading queue */
  const downloadFileQueue = async.queue(({ url, zimCreator }, finished) => {
    downloadFileAndCache(zimCreator, url, finished);
  }, speed * 5);

  /* ********************************* */
  /* GET CONTENT ********************* */
  /* ********************************* */

  await mw.login(downloader);

  if (articleList && articleList.includes('http')) {
    try {
      const fileName = articleList.split('/').slice(-1)[0];
      const tmpArticleListPath = path.join(dumpTmpDir, fileName);
      logger.log(`Downloading article list from [${articleList}] to [${tmpArticleListPath}]`);
      const { data: articleListContentStream } = await axios.get(articleList, { responseType: 'stream' });
      const articleListWriteStream = fs.createWriteStream(tmpArticleListPath);
      await new Promise((resolve, reject) => {
        articleListContentStream
          .pipe(articleListWriteStream)
          .on('error', (err: any) => reject(err))
          .on('close', resolve);
      });
      articleList = tmpArticleListPath;
    } catch (err) {
      throw new Error(`Failed to download article list from [${articleList}]`);
    }
  }

  let articleListLines: string[];
  try {
    articleListLines = articleList ? fs.readFileSync(articleList).toString().split('\n') : [];
  } catch (err) {
    logger.error(`Failed to read articleList from [${articleList}]`, err);
    throw err;
  }

  // await mw.getTextDirection(env, downloader);
  // await mw.getSiteInfo(env, downloader);
  // await zim.getSubTitle();
  await mw.getNamespaces(addNamespaces, downloader);
  // await zim.createDirectories();

  const { redirectQueue, articleDetailXId } = await getArticleIds(downloader, redis, mw, mainPage || mwMetaData.mainPage, articleList);
  await drainRedirectQueue(redirectQueue);

  for (const _dump of dumps) {
    const dump = new Dump(_dump, {
      tmpDir: dumpTmpDir,
      username: mwUsername,
      password: mwPassword,
      spaceDelimiter: '_',
      outputDirectory,
      tmpDirectory,
      cacheDirectory,
      keepHtml,
      mainPage,
      filenamePrefix,
      articleList,
      publisher,
      customZimDescription,
      customZimTags,
      customZimTitle,
      withoutZimFullTextIndex,
      deflateTmpHtml,
      resume,
      minifyHtml,
      keepEmptyParagraphs,
    }, mwMetaData);
    logger.log(`Doing dump: [${dump}]`);
    let shouldSkip = false;
    try {
      dump.checkResume();
    } catch (err) {
      shouldSkip = true;
    }

    if (shouldSkip) {
      logger.log(`Skipping dump: [${dump}]`);
    } else {
      try {
        await doDump(dump);
      } catch (err) {
        debugger;
        throw err;
      }
      logger.log(`Finished dump: [${dump}]`);
    }
  }

  if (!useCache || skipCacheCleaning) {
    logger.log('Skipping cache cleaning...');
    await exec(`rm -f "${cacheDirectory}ref"`);
  } else {
    logger.log('Cleaning cache');
    await exec(`find "${cacheDirectory}" -type f -not -newer "${cacheDirectory}ref" -exec rm {} \\;`);
  }

  await redis.flushDBs();
  await redis.quit();
  logger.log('Closing HTTP agents...');

  logger.log('All dumping(s) finished with success.');

  async function doDump(dump: Dump) {
    const zimName = (dump.opts.publisher ? `${dump.opts.publisher.toLowerCase()}.` : '') + dump.computeFilenameRadical(false, true, true);

    const outZim = pathParser.resolve(dump.opts.outputDirectory, dump.computeFilenameRadical() + '.zim');
    logger.log(`Writing zim to [${outZim}]`);

    const zimCreatorConstructor = dump.nozim ? ZimCreatorFs : ZimCreator;

    const zimCreator = new zimCreatorConstructor({
      fileName: outZim,
      fullTextIndexLanguage: dump.opts.withoutZimFullTextIndex ? '' : dump.mwMetaData.langIso3,
      welcome: dump.opts.mainPage ? dump.getArticleBase(dump.opts.mainPage) : 'index.htm',
    }, {
        favicon: 'favicon.png',
        Tags: dump.opts.customZimTags || '',
        Language: dump.mwMetaData.langIso3,
        Title: dump.opts.customZimTitle || dump.mwMetaData.title,
        Name: zimName,
        Description: dump.opts.customZimDescription || dump.mwMetaData.subTitle || zimName,
        Creator: dump.mwMetaData.creator,
        Publisher: dump.opts.publisher,
      });

    logger.log(`Storing redirects`);
    await getRedirects(dump, zimCreator);

    logger.info('Copying Static Resource Files');
    await saveStaticFiles(config, zimCreator);

    logger.info('Finding stylesheets to download');
    const stylesheetsToGet = await dump.getRelevantStylesheetUrls(downloader);
    logger.log(`Found [${stylesheetsToGet.length}] stylesheets to download`);

    logger.log(`Downloading stylesheets and populating media queue`);
    const {
      mediaItemsToDownload,
      finalCss,
    } = await getAndProcessStylesheets(downloader, stylesheetsToGet);
    logger.log(`Downloaded stylesheets, media queue is [${mediaItemsToDownload.length}] items`);

    // Download Media Items
    logger.log(`Downloading [${mediaItemsToDownload.length}] media items`);
    await mapLimit(mediaItemsToDownload, speed, async ({ url, path }) => {
      try {
        const { content } = await downloader.downloadContent(url);
        const article = new ZimArticle(path, content, 'A');
        return zimCreator.addArticle(article);
      } catch (err) {
        logger.warn(`Failed to download item [${url}], skipping`);
      }
    });

    const article = new ZimArticle(`style.css`, finalCss, 'A');
    await zimCreator.addArticle(article);

    logger.log(`Getting Favicon`);
    await saveFavicon(dump, zimCreator);

    if (articleList && articleListLines.length > MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE) {
      logger.log(`Getting Article Thumbnails`);
      const thumbnailUrls = await getArticleThumbnails(downloader, mw, articleListLines);
      if (thumbnailUrls.length > MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE) {
        for (const { articleId, imageUrl } of thumbnailUrls) {
          downloadFileQueue.push({ url: imageUrl, zimCreator });
          const internalSrc = getMediaBase(imageUrl, true);

          articleDetailXId[articleId] = Object.assign(
            articleDetailXId[articleId] || {},
            { thumbnail: internalSrc },
          );
        }
      }
    }

    logger.log(`Getting Main Page`);
    await getMainPage(dump, zimCreator);

    logger.log(`Getting articles`);
    const mediaDeps = await saveArticles(zimCreator, redis, downloader, mw, dump, articleDetailXId);
    logger.log(`Found [${mediaDeps.length}] dependencies`);

    for (const depUrl of mediaDeps) { // TODO: remove downloadFileQueue
      downloadFileQueue.push({ url: depUrl, zimCreator });
    }

    await drainDownloadFileQueue(zimCreator);

    logger.log(`Finishing Zim Creation`);
    zimCreator.finalise();

    await redis.delMediaDB();
  }

  /* ********************************* */
  /* FUNCTIONS *********************** */
  /* ********************************* */

  function drainDownloadFileQueue(zimCreator: ZimCreator) {
    return new Promise((resolve, reject) => {
      logger.log(`${downloadFileQueue.length()} files still to be downloaded.`);
      async.doWhilst(
        (doneWait) => {
          if (downloadFileQueue.idle()) {
            logger.log('Process still downloading images...');
          }
          setTimeout(doneWait, 1000);
        },
        () => !downloadFileQueue.idle(),
        () => {
          const drainBackup = downloadFileQueue.drain;
          downloadFileQueue.drain = function (error: any) {
            if (error) {
              reject(`Error by downloading images ${error}`);
            } else {
              if (downloadFileQueue.length() === 0) {
                logger.log('All images successfuly downloaded');
                downloadFileQueue.drain = drainBackup;
                resolve();
              }
            }
          } as any;
          downloadFileQueue.push({ url: '', zimCreator });
        },
      );
    });
  }

  function getRedirects(dump: Dump, zimCreator: ZimCreator) {
    logger.log('Reset redirects cache file (or create it)');

    logger.log('Storing redirects...');
    function cacheRedirect(redirectId: string, finished: Callback) {
      redis.getRedirect(redirectId, finished, (target: string) => {
        logger.info(`Storing redirect ${redirectId} (to ${target})...`);
        const url = dump.getArticleBase(redirectId);
        const redirectArticle = new ZimArticle(url, '', 'A', 'text/plain', dump.getArticleBase(target, false), `A/${url}`, redirectId.replace(/_/g, ' '));
        zimCreator.addArticle(redirectArticle)
          .then(finished, finished);
      });
    }

    return redis.processAllRedirects(speed, cacheRedirect,
      'Unable to cache a redirect',
      'All redirects were cached successfuly.',
    );
  }

  /* Multiple developer friendly functions */
  function downloadContentAndCache(url: string): Promise<{ content: any, responseHeaders: any }> {
    return new Promise((resolve, reject) => {
      const cachePath = cacheDirectory + crypto.createHash('sha1').update(url).digest('hex').substr(0, 20);
      const cacheHeadersPath = `${cachePath}.h`;

      async.series(
        [
          (finished) => {
            fs.readFile(cachePath, (error, data) => {
              finished(error, error ? undefined : data.toString());
            });
          },
          (finished) => {
            fs.readFile(cacheHeadersPath, (error, data) => {
              try {
                finished(error, error ? undefined : JSON.parse(data.toString()));
              } catch (error) {
                finished({ message: `Error in downloadContentAndCache() JSON parsing of ${cacheHeadersPath}`, error } as any);
              }
            });
          },
        ],
        (error, results) => {
          if (error) {
            downloader.downloadContent(url)
              .then(({ content, responseHeaders }) => {
                if (useCache) {
                  logger.info(`Caching ${url} at ${cachePath}...`);
                  fs.writeFile(cacheHeadersPath, JSON.stringify(responseHeaders), () => {
                    fs.writeFile(cachePath, content, () => {
                      resolve({ content, responseHeaders });
                    });
                  });
                } else {
                  resolve({ content, responseHeaders });
                }
              })
              .catch((err) => {
                logger.warn(err);
                reject(err);
              });
          } else {
            logger.log(`Cache hit for ${url} (${cachePath})`);
            touch(cachePath);
            resolve({ content: results[0], responseHeaders: results[1] });
          }
        },
      );
    });
  }

  function downloadFileAndCache(zimCreator: ZimCreator, url: string, callback: Callback) {
    if (!url) {
      callback();
      return;
    }

    logger.info(`Downloading and Caching [${url}]`);

    const parts = MEDIA_REGEX.exec(decodeURI(url));
    const filenameBase = parts[2].length > parts[5].length
      ? parts[2]
      : parts[5] + (parts[6] || '.svg') + (parts[7] || '');
    const width = parseInt(parts[4].replace(/px-/g, ''), 10) || INFINITY_WIDTH;

    /* Check if we have already met this image during this dumping process */
    redis.getMedia(filenameBase, (error: any, rWidth: number) => {
      /* If no redis entry */
      if (error || !rWidth || rWidth < width) {
        /* Set the redis entry if necessary */
        redis.saveMedia(filenameBase, width, () => {
          const mediaPath = getMediaBase(url, false);
          const cachePath = `${cacheDirectory}m/${crypto.createHash('sha1').update(filenameBase).digest('hex').substr(0, 20)}${pathParser.extname(urlParser.parse(url, false, true).pathname || '') || ''}`;
          const cacheHeadersPath = `${cachePath}.h`;
          let toDownload = false;

          /* Check if the file exists in the cache */
          if (fs.existsSync(cacheHeadersPath) && fs.existsSync(cachePath)) {
            let responseHeaders;
            try {
              responseHeaders = JSON.parse(fs.readFileSync(cacheHeadersPath).toString());
            } catch (err) {
              logger.warn(`Error in downloadFileAndCache() JSON parsing of ${cacheHeadersPath}`, err);
              responseHeaders = undefined;
            }

            /* If the cache file width higher than needed, use it. Otherwise download it and erase the cache */
            if (!responseHeaders || responseHeaders.width < width) {
              toDownload = true;
            } else {
              fs.symlink(cachePath, mediaPath, 'file', (error) => {
                if (error) {
                  if (error.code !== 'EEXIST') {
                    return callback({ message: `Unable to create symlink to ${mediaPath} at ${cachePath}`, error });
                  }
                  if (!skipCacheCleaning) {
                    touch(cachePath);
                  }
                }

                if (!skipCacheCleaning) {
                  touch(cacheHeadersPath);
                }
              });
              redis.deleteOrCacheMedia(responseHeaders.width === width, width, filenameBase);
              callback();
            }
          } else {
            toDownload = true;
          }

          /* Download the file if necessary */
          if (toDownload) {
            const dlPromise = downloader.downloadContent(url);
            if (useCache) {
              dlPromise
                .then(async ({ content }) => {
                  logger.info(`Caching ${filenameBase} at ${cachePath}...`);
                  await writeFilePromise(cachePath, content);
                });
            }

            dlPromise
              .then(({ content }) => {
                const article = new ZimArticle(mediaPath, content, 'A');
                return zimCreator.addArticle(article);
              })
              .then(() => callback())
              .catch((error) => callback({ message: 'Failed to write file', error }));

          } else {
            logger.info(`Cache hit for ${url}`);
          }
        });
      } else {
        /* We already have this image with a resolution equal or higher to what we need */
        callback();
      }
    });
  }

  async function saveFavicon(dump: Dump, zimCreator: ZimCreator) {
    logger.log('Saving favicon.png...');

    function resizeFavicon(zimCreator: ZimCreator, faviconPath: string) {
      return new Promise((resolve, reject) => {
        const cmd = `convert -thumbnail 48 "${faviconPath}" "${faviconPath}.tmp" ; mv "${faviconPath}.tmp" "${faviconPath}" `;
        exec(cmd, (error) => {
          if (error) {
            reject();
          } else {
            readFilePromise(faviconPath).then((faviconContent) => {
              const article = new ZimArticle('favicon.png', faviconContent, 'I');
              return zimCreator.addArticle(article);
            }).then(resolve, reject);
          }
        }).on('error', (error) => {
          reject(error);
          // console.error(error);
        });
      });
    }

    if (customZimFavicon) {
      return resizeFavicon(zimCreator, customZimFavicon);
    } else {
      return downloader.downloadContent(mw.siteInfoUrl())
        .then(async ({ content }) => {
          const body = content.toString();
          const entries = JSON.parse(body).query.general;
          if (!entries.logo) {
            throw new Error(`********\nNo site Logo Url. Expected a string, but got [${entries.logo}].\n\nPlease try specifying a customZimFavicon (--customZimFavicon=./path/to/your/file.ico)\n********`);
          }

          const parsedUrl = urlParser.parse(entries.logo);
          const ext = parsedUrl.pathname.split('.').slice(-1)[0];

          const faviconPath = pathParser.join(dumpTmpDir, `favicon.${ext}`);
          const faviconFinalPath = pathParser.join(dumpTmpDir, `favicon.png`);
          const logoUrl = parsedUrl.protocol ? entries.logo : 'http:' + entries.logo;
          const logoContent = await downloader.downloadContent(logoUrl);
          await writeFilePromise(faviconPath, logoContent.content);
          if (ext !== 'png') {
            logger.info(`Original favicon is not a PNG ([${ext}]). Converting it to PNG`);
            await new Promise((resolve, reject) => {
              exec(`convert ${faviconPath} ${faviconFinalPath}`, (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
          }
          return resizeFavicon(zimCreator, faviconFinalPath);
        });
    }
  }

  function getMainPage(dump: Dump, zimCreator: ZimCreator) {
    function writeMainPage(html: string) {
      // const mainPagePath = `${dump.computeHtmlRootPath}index.htm`;
      if (dump.opts.deflateTmpHtml) {
        return new Promise((resolve, reject) => {
          zlib.deflate(html, (error, deflatedHtml) => {
            const article = new ZimArticle('index.htm', deflatedHtml, 'A', 'text/html');
            zimCreator.addArticle(article).then(resolve, reject);
            // writeFilePromise(mainPagePath, deflatedHtml).then(resolve, reject);
          });
        });
      } else {
        // return writeFilePromise(mainPagePath, html);
        const article = new ZimArticle('index.htm', html, 'A', 'text/html');
        return zimCreator.addArticle(article);
      }
    }

    function createMainPage() {
      logger.log('Creating main page...');
      const doc = domino.createDocument(
        articleListHomeTemplate
          .replace('</head>',
            genHeaderCSSLink(config, 'mobile_main_page') + '\n' +
            genHeaderCSSLink(config, 'style') + '\n' +
            genHeaderScript(config, 'images_loaded.min') + '\n' +
            genHeaderScript(config, 'masonry.min') + '\n' +
            genHeaderScript(config, 'article_list_home') + '\n' +
            '\n</head>'),
      );

      const titles = Object.keys(articleDetailXId).sort();

      const {
        articlesWithImages,
        articlesWithoutImages,
        allArticles,
      } = titles.reduce((acc, title) => {
        const articleDetail = articleDetailXId[title];
        acc.allArticles.push(articleDetail);
        if (articleDetail.thumbnail) {
          acc.articlesWithImages.push(articleDetail);
        } else {
          acc.articlesWithoutImages.push(articleDetail);
        }
        return acc;
      }, {
          articlesWithImages: [],
          articlesWithoutImages: [],
          allArticles: [],
        },
      );

      if (articlesWithImages.length > MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE) {
        const articlesWithImagesEl = articlesWithImages.map((article) => makeArticleImageTile(dump, article)).join('\n');
        doc.getElementById('content').innerHTML = articlesWithImagesEl;
      } else {
        const articlesWithoutImagesEl = allArticles.map((article) => makeArticleListItem(dump, article)).join('\n');
        doc.getElementById('list').innerHTML = articlesWithoutImagesEl;
      }

      // const dumpTitle = customZimTitle || (new URL(mwUrl)).host;
      // doc.getElementById('title').textContent = dumpTitle;

      /* Write the static html file */
      return writeMainPage(doc.documentElement.outerHTML);
    }

    function createMainPageRedirect() {
      logger.log('Create main page redirection...');
      const html = redirectTemplate({
        title: mainPage.replace(/_/g, ' '),
        target: dump.getArticleBase(mainPage, true),
        strings,
      });
      return writeMainPage(html);
    }

    if (mainPage) {
      return createMainPageRedirect();
    } else {
      return createMainPage();
    }
  }

}

export {
  getParametersList,
  execute,
};
