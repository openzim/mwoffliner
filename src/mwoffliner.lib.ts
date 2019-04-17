/* ********************************** */
/* MODULE VARIABLE SECTION ********** */
/* ********************************** */

import { exec } from 'child_process';
import domino from 'domino';
import fs from 'fs';
import os from 'os';
import pathParser from 'path';
import urlParser from 'url';
import semver from 'semver';
import * as path from 'path';
import axios from 'axios';
import { ZimCreator, ZimArticle } from '@openzim/libzim';
import homeDirExpander from 'expand-home-dir';
import rimraf from 'rimraf';
import im from 'imagemagick';

import { config } from './config';
import Downloader from './Downloader';
import MediaWiki from './MediaWiki';
import parameterList from './parameterList';
import Redis from './redis';
import { writeFilePromise, mkdirPromise, isValidEmail, genHeaderCSSLink, genHeaderScript, saveStaticFiles, readFilePromise, makeArticleImageTile, makeArticleListItem, getDumps, getMediaBase, MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE, removeDuplicatesAndLowRes, downloadAndSaveModule } from './util';
import { mapLimit } from 'promiso';
import packageJSON from '../package.json';
import { ZimCreatorFs } from './ZimCreatorFs';
import logger from './Logger';
import { getAndProcessStylesheets } from './util';
import { Dump } from './Dump';
import { getArticleIds } from './util/redirects';
import { articleListHomeTemplate } from './Templates';
import { saveArticles } from './util/saveArticles';
import { articleDetailXId, populateArticleDetail } from './articleDetail';

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
    keepHtml: keepHtml,
    publisher: _publisher,
    outputDirectory: _outputDirectory,
    cacheDirectory: _cacheDirectory,
    addNamespaces: _addNamespaces,
    articleList: _articleList,
    customZimFavicon: _customZimFavicon,
    useCache,
  } = argv;

  (process as any).verbose = !!verbose;

  let articleList = _articleList ? String(_articleList) : _articleList;
  const publisher = _publisher || config.defaults.publisher;
  let customZimFavicon = _customZimFavicon;

  const outputDirectory = _outputDirectory ? `${homeDirExpander(_outputDirectory)}/` : 'out/';
  await mkdirPromise(outputDirectory);
  const cacheDirectory = _cacheDirectory ? `${homeDirExpander(_cacheDirectory)}/` : 'cac/';
  const tmpDirectory = os.tmpdir();

  // Tmp Dirs
  const dumpId = `mwo-dump-${Date.now()}`;
  const dumpTmpDir = path.resolve(tmpDirectory, `${dumpId}`);
  try {
    logger.info(`Creating dump temporary directory [${dumpTmpDir}]`);
    await mkdirPromise(dumpTmpDir);
  } catch (err) {
    logger.error(`Failed to create dump temporary directory, exiting`, err);
    throw err;
  }

  process.on('exit', async (code) => {
    logger.log(`Exiting with code [${code}]`);
    logger.log(`Deleting tmp dump dir [${dumpTmpDir}]`);
    rimraf.sync(dumpTmpDir);

    logger.log(`Flushing REDIS DBs`);
    articleDetailXId.flush();
    await redis.flushDBs();
    await redis.quit();
  });
  process.on('SIGTERM', () => {
    logger.log(`SIGTERM`);
    process.exit(128 + 15);
  });
  process.on('SIGINT', () => {
    logger.log(`SIGINT`);
    process.exit(128 + 2);
  });

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
  let useLocalMCS = true;
  let mwMetaData;
  try {
    mwMetaData = await mw.getMwMetaData(downloader);
  } catch (err) {
    logger.error(`FATAL - Failed to get MediaWiki Metadata`);
    throw err;
  }

  try {
    const MCSMainPageQuery = await downloader.getJSON<any>(`${downloader.mcsUrl}${encodeURIComponent(mwMetaData.mainPage)}`);
    useLocalMCS = !MCSMainPageQuery.lead;
  } catch (err) {
    logger.warn(`Failed to get remote MCS:`, err);
  }

  if (useLocalMCS) {
    logger.log(`Using a local MCS instance, couldn't find a remote one`);
    await downloader.initLocalMcs();
  } else {
    logger.log(`Using a remote MCS instance`);
  }

  const mainPage = customMainPage || (articleList ? '' : mwMetaData.mainPage);

  /* *********************************** */
  /*       SYSTEM VARIABLE SECTION       */
  /* *********************************** */

  const dumps = getDumps(format);

  const addNamespaces = _addNamespaces ? String(_addNamespaces).split(',').map((a: string) => Number(a)) : [];

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
  await redis.flushDBs();
  populateArticleDetail(redis.redisClient);

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
    articleListLines = articleList ? fs.readFileSync(articleList).toString().split('\n').filter((a) => a).map((a) => a.replace(/ /g, '_')) : [];
    logger.info(`ArticleList has [${articleListLines.length}] items`);
  } catch (err) {
    logger.error(`Failed to read articleList from [${articleList}]`, err);
    throw err;
  }

  await mw.getNamespaces(addNamespaces, downloader);

  logger.info(`Getting article ids`);
  await getArticleIds(downloader, redis, mw, mainPage, articleList ? articleListLines : null);

  // const categoriesWithArticleChildren = new Set<string>([]);
  // let articleIds = await articleDetailXId.keys();
  // await mapLimit(articleIds, downloader.speed, async (articleId) => {
  //   const articleDetail = await articleDetailXId.get(articleId);
  //   if (articleDetail.ns !== 14 && articleDetail.categories) {
  //     for (const category of articleDetail.categories) {
  //       const categoryArticleId = category.title.replace(/ /g, '_');
  //       categoriesWithArticleChildren.add(categoryArticleId);
  //     }
  //   }
  // });
  // logger.info(`Found [${categoriesWithArticleChildren.size}] category pages with at least one article child, deleting empty Categories`);
  // let categoryDeleteCount = 0;
  // articleIds = await articleDetailXId.keys();
  // await mapLimit(articleIds, downloader.speed, async (categoryId) => {
  //   const categoryDetail = await articleDetailXId.get(categoryId);
  //   if (categoryDetail.ns === 14) {
  //     if (!categoriesWithArticleChildren.has(categoryId)) {
  //       articleDetailXId.delete(categoryId); // Not Awaiting
  //       categoryDeleteCount += 1;
  //     }
  //   }
  // });
  // if (categoryDeleteCount) {
  //   logger.info(`Deleted [${categoryDeleteCount}] empty categories`);
  // }

  // if (articleList) {
  //   const categoriesRet = await getArticleIds(downloader, redis, mw, null, Array.from(categoriesWithArticleChildren));
  //   logger.log(`Got [${Object.keys(categoriesRet).length}] Categories`);
  //   await articleDetailXId.setMany(categoriesRet as KVS<ArticleDetail>);
  // }

  for (const _dump of dumps) {
    const dump = new Dump(_dump, {
      tmpDir: dumpTmpDir,
      username: mwUsername,
      password: mwPassword,
      spaceDelimiter: '_',
      outputDirectory,
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
      resume,
      minifyHtml,
      keepEmptyParagraphs,
    }, mwMetaData);
    logger.log(`Doing dump`);
    let shouldSkip = false;
    try {
      dump.checkResume();
    } catch (err) {
      shouldSkip = true;
    }

    if (shouldSkip) {
      logger.log(`Skipping dump`);
    } else {
      try {
        await doDump(dump);
      } catch (err) {
        debugger;
        throw err;
      }
      logger.log(`Finished dump`);
    }
  }

  if (!useCache || skipCacheCleaning) {
    logger.log('Skipping cache cleaning...');
    await exec(`rm -f "${cacheDirectory}ref"`);
  } else {
    logger.log('Cleaning cache');
    await exec(`find "${cacheDirectory}" -type f -not -newer "${cacheDirectory}ref" -exec rm {} \\;`);
  }
  logger.log('Closing HTTP agents...');

  logger.log('All dumping(s) finished with success.');

  async function doDump(dump: Dump) {
    let filesToDownload: Array<{ url: string, path: string, namespace: string }> = [];

    const zimName = (dump.opts.publisher ? `${dump.opts.publisher.toLowerCase()}.` : '') + dump.computeFilenameRadical(false, true, true);

    const outZim = pathParser.resolve(dump.opts.outputDirectory, dump.computeFilenameRadical() + '.zim');
    logger.log(`Writing zim to [${outZim}]`);

    const zimCreatorConstructor = dump.nozim ? ZimCreatorFs : ZimCreator;

    const zimCreator = new zimCreatorConstructor({
      fileName: outZim,
      fullTextIndexLanguage: dump.opts.withoutZimFullTextIndex ? '' : dump.mwMetaData.langIso3,
      welcome: 'A/' + (dump.opts.mainPage ? dump.getArticleBase(dump.opts.mainPage) : 'index'),
    }, {
        favicon: 'I/favicon.png',
        Tags: dump.opts.customZimTags || '',
        Language: dump.mwMetaData.langIso3,
        Title: dump.opts.customZimTitle || dump.mwMetaData.title,
        Name: zimName,
        Description: dump.opts.customZimDescription || dump.mwMetaData.subTitle || zimName,
        Creator: dump.mwMetaData.creator,
        Publisher: dump.opts.publisher,
      });

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
    filesToDownload = filesToDownload.concat(
      mediaItemsToDownload.map((m) => {
        return {
          ...m,
          namespace: '-',
        };
      }),
    );

    const article = new ZimArticle({ url: `style.css`, data: finalCss, ns: '-' });
    await zimCreator.addArticle(article);

    logger.log(`Getting Favicon`);
    await saveFavicon(dump, zimCreator);
    if (!customMainPage && articleList && articleListLines.length > MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE) {
      await mapLimit(articleListLines, downloader.speed, async (articleId) => {
        const articleDetail = await articleDetailXId.get(articleId);
        if (!articleDetail) {
          return null;
        }
        const imageUrl = articleDetail.thumbnail;
        if (imageUrl) {
          const path = getMediaBase(imageUrl.source, false);
          filesToDownload.push({ url: imageUrl.source, path, namespace: 'I' });

          const resourceNamespace = 'I';
          const internalSrc = `../${resourceNamespace}/` + getMediaBase(imageUrl.source, true);

          articleDetail.internalThumbnailUrl = internalSrc;
          await articleDetailXId.set(articleId, articleDetail);
        }
      });
    }

    logger.log(`Getting Main Page`);
    await getMainPage(dump, zimCreator);

    logger.log(`Getting articles`);

    const { mediaDependencies, jsModuleDependencies, cssModuleDependencies } = await saveArticles(zimCreator, redis, downloader, mw, dump);

    logger.log(`Found [${jsModuleDependencies.size}] js module dependencies`);
    logger.log(`Found [${cssModuleDependencies.size}] style module dependencies`);

    const allDependenciesWithType = [
      { type: 'js', moduleList: Array.from(jsModuleDependencies) },
      { type: 'css', moduleList: Array.from(cssModuleDependencies) },
    ];

    logger.log(`Downloading module dependencies`);
    await Promise.all(allDependenciesWithType.map(async ({ type, moduleList }) => {
      return await mapLimit(moduleList, downloader.speed, (oneModule) => {
        return downloadAndSaveModule(zimCreator, redis, mw, downloader, dump, oneModule, type as any);
      });
    }));

    logger.log(`Downloading [${Object.keys(mediaDependencies).length}] media dependencies`);
    filesToDownload = filesToDownload.concat(
      Object.entries(mediaDependencies).map(([url, path]) => {
        return {
          url,
          path,
          namespace: 'I',
        };
      }),
    );

    filesToDownload = removeDuplicatesAndLowRes(filesToDownload);

    // Download Media Items
    logger.log(`Downloading [${filesToDownload.length}] files`);
    let fileDownloadIndex = 0;
    await mapLimit(filesToDownload, speed, async ({ url, path, namespace }) => {
      fileDownloadIndex += 1;

      if (fileDownloadIndex % 100 === 0) {
        logger.log(`Downloading file [${fileDownloadIndex}/${filesToDownload.length}] [${Math.floor(fileDownloadIndex / filesToDownload.length * 100)}%]`);
      }
      try {
        let content;
        const resp = await downloader.downloadContent(url);
        content = resp.content;

        const article = new ZimArticle({ url: path, data: content, ns: namespace });
        return zimCreator.addArticle(article);
      } catch (err) {
        logger.warn(`Failed to download item [${url}], skipping`);
      }
    }).then((a) => a.filter((a) => a));

    logger.log(`Creating redirects`);
    await getRedirects(dump, zimCreator);

    logger.log(`Finishing Zim Creation`);
    zimCreator.finalise();

    await redis.delMediaDB();
  }

  /* ********************************* */
  /* FUNCTIONS *********************** */
  /* ********************************* */

  function getRedirects(dump: Dump, zimCreator: ZimCreator) {
    logger.log('Reset redirects cache file (or create it)');

    logger.log('Storing redirects...');
    function cacheRedirect(redirectId: string, finished: Callback) {
      redis.getRedirect(redirectId, finished, (target: string) => {
        logger.info(`Storing redirect ${redirectId} (to ${target})...`);
        const url = dump.getArticleBase(redirectId);
        const redirectArticle = new ZimArticle({ url, data: '', ns: 'A', mimeType: 'text/plain', title: redirectId.replace(/_/g, ' '), redirectAid: 'A/' + dump.getArticleBase(target, false), aid: `A/${url}` });
        zimCreator.addArticle(redirectArticle)
          .then(finished, (err: any) => {
            logger.warn(`Failed to create redirect, skipping: `, err);
            finished();
          });
      });
    }

    return redis.processAllRedirects(speed, cacheRedirect,
      'Unable to cache a redirect',
      'All redirects were cached successfuly.',
    );
  }

  async function saveFavicon(dump: Dump, zimCreator: ZimCreator) {
    logger.log('Saving favicon.png...');

    function resizeFavicon(zimCreator: ZimCreator, faviconPath: string) {
      return new Promise((resolve, reject) => {
        im.convert([faviconPath, '-thumbnail', '48', faviconPath], (err) => {
          if (err) {
            reject(err);
          } else {
            readFilePromise(faviconPath, null).then((faviconContent) => {
              const article = new ZimArticle({ url: 'favicon.png', data: faviconContent, ns: 'I' });
              return zimCreator.addArticle(article);
            }).then(resolve, reject);
          }
        });
      });
    }

    if (customZimFavicon) {
      return resizeFavicon(zimCreator, customZimFavicon);
    } else {
      const body = await downloader.getJSON<any>(mw.siteInfoUrl());
      const entries = body.query.general;
      if (!entries.logo) {
        throw new Error(`********\nNo site Logo Url. Expected a string, but got [${entries.logo}].\n\nPlease try specifying a customZimFavicon (--customZimFavicon=./path/to/your/file.ico)\n********`);
      }

      const parsedUrl = urlParser.parse(entries.logo);
      const ext = parsedUrl.pathname.split('.').slice(-1)[0];

      const faviconPath = pathParser.join(dumpTmpDir, `favicon.${ext}`);
      let faviconFinalPath = pathParser.join(dumpTmpDir, `favicon.png`);
      const logoUrl = parsedUrl.protocol ? entries.logo : 'http:' + entries.logo;
      const logoContent = await downloader.downloadContent(logoUrl);
      await writeFilePromise(faviconPath, logoContent.content);
      if (ext !== 'png') {
        logger.info(`Original favicon is not a PNG ([${ext}]). Converting it to PNG`);
        await new Promise((resolve, reject) => {
          im.convert([faviconPath, faviconFinalPath], (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      } else {
        faviconFinalPath = faviconPath;
      }
      return resizeFavicon(zimCreator, faviconFinalPath);
    }
  }

  function getMainPage(dump: Dump, zimCreator: ZimCreator) {
    async function createMainPage() {
      logger.log('Creating main page...');
      const doc = domino.createDocument(
        articleListHomeTemplate
          .replace('</head>',
            genHeaderCSSLink(config, 'mobile_main_page', dump.mwMetaData.mainPage) + '\n' +
            genHeaderCSSLink(config, 'style', dump.mwMetaData.mainPage) + '\n' +
            genHeaderScript(config, 'images_loaded.min', dump.mwMetaData.mainPage) + '\n' +
            genHeaderScript(config, 'masonry.min', dump.mwMetaData.mainPage) + '\n' +
            genHeaderScript(config, 'article_list_home', dump.mwMetaData.mainPage) + '\n' +
            '\n</head>'),
      );

      const titles = articleListLines.map((title) => title.replace(/ /g, '_'));

      const articlesWithImages: ArticleDetail[] = [];
      const articlesWithoutImages: ArticleDetail[] = [];
      const allArticles: ArticleDetail[] = [];
      for (const title of titles) {
        const articleDetail = await articleDetailXId.get(title);
        if (articleDetail) {
          allArticles.push(articleDetail);
          if (articleDetail.thumbnail) {
            articlesWithImages.push(articleDetail);
            if (articlesWithImages.length >= 100) {
              break;
            }
          } else {
            articlesWithoutImages.push(articleDetail);
          }
        }
      }

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
      const article = new ZimArticle({ url: 'index' + (dump.nozim ? '.html' : ''), data: doc.documentElement.outerHTML, ns: 'A', mimeType: 'text/html', title: 'Main Page' });
      return zimCreator.addArticle(article);
    }

    function createMainPageRedirect() {
      logger.log(`Create main page redirection from [index] to [${'A/' + dump.getArticleBase(mainPage, true)}]`);
      const article = new ZimArticle({ url: 'index' + (dump.nozim ? '.html' : ''), shouldIndex: true, data: '', ns: 'A', mimeType: 'text/html', title: mainPage, redirectAid: 'A/' + dump.getArticleBase(mainPage, true) });
      return zimCreator.addArticle(article);
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
