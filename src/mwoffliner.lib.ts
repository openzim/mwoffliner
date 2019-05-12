/* ********************************** */
/* MODULE VARIABLE SECTION ********** */
/* ********************************** */

import domino from 'domino';
import fs, { rmdirSync } from 'fs';
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
import { writeFilePromise, mkdirPromise, isValidEmail, genHeaderCSSLink, genHeaderScript, saveStaticFiles, readFilePromise, makeArticleImageTile, makeArticleListItem, getDumps, getMediaBase, MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE, removeDuplicatesAndLowRes, downloadAndSaveModule, getSizeFromUrl } from './util';
import { mapLimit } from 'promiso';
import packageJSON from '../package.json';
import { ZimCreatorFs } from './ZimCreatorFs';
import logger from './Logger';
import { getAndProcessStylesheets } from './util';
import { Dump } from './Dump';
import { getArticleIds } from './util/redirects';
import { articleListHomeTemplate } from './Templates';
import { saveArticles, downloadFiles } from './util/saveArticles';
import { filesToDownloadXPath, populateFilesToDownload, articleDetailXId, populateArticleDetail, populateRequestCache, requestCacheXUrl } from './stores';
import { getCategoriesForArticles, trimUnmirroredPages } from './util/categories';

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

  /* Setup redis client */
  const redis = new Redis(argv, config);
  await redis.flushDBs();
  populateArticleDetail(redis.redisClient);
  populateFilesToDownload(redis.redisClient);
  populateRequestCache(redis.redisClient);

  let articleList = _articleList ? String(_articleList) : _articleList;
  const publisher = _publisher || config.defaults.publisher;
  let customZimFavicon = _customZimFavicon;

  const outputDirectory = path.join(process.cwd(), _outputDirectory ? `${homeDirExpander(_outputDirectory)}/` : 'out/');
  await mkdirPromise(outputDirectory);
  const cacheDirectory = path.join(process.cwd(), _cacheDirectory ? `${homeDirExpander(_cacheDirectory)}/` : `cac/dumps-${Date.now()}/`);
  await mkdirPromise(cacheDirectory);
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

  logger.log(`Using Tmp Directories:`, {
    outputDirectory,
    cacheDirectory,
    dumpTmpDir,
  });

  process.on('exit', async (code) => {
    logger.log(`Exiting with code [${code}]`);
    logger.log(`Deleting tmp dump dir [${dumpTmpDir}]`);
    rimraf.sync(dumpTmpDir);
    logger.log(`Clearing Cache Directory`);
    rimraf.sync(cacheDirectory);

    logger.log(`Flushing Redis DBs`);
    filesToDownloadXPath.flush();
    articleDetailXId.flush();
    requestCacheXUrl.flush();

    redis.flushDBs();
    redis.quit();
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
    getCategories: !!argv.getCategories,
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
    useCache,
    cacheDirectory,
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
  await getCategoriesForArticles(articleDetailXId, downloader, redis);
  await trimUnmirroredPages(downloader); // Remove unmirrored pages, categories, subCategories

  for (const _dump of dumps) {
    const dump = new Dump(_dump, {
      tmpDir: dumpTmpDir,
      username: mwUsername,
      password: mwPassword,
      spaceDelimiter: '_',
      outputDirectory,
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
      tags: customZimTags,
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

  logger.log('Closing HTTP agents...');

  logger.log('All dumping(s) finished with success.');

  async function doDump(dump: Dump) {
    const zimName = (dump.opts.publisher ? `${dump.opts.publisher.toLowerCase()}.` : '') + dump.computeFilenameRadical(false, true, true);

    const outZim = pathParser.resolve(dump.opts.outputDirectory, dump.computeFilenameRadical() + '.zim');
    logger.log(`Writing zim to [${outZim}]`);

    logger.log(`Flushing redis file store`);
    await filesToDownloadXPath.flush();

    const zimCreatorConstructor = dump.nozim ? ZimCreatorFs : ZimCreator;

    const zimCreator = new zimCreatorConstructor({
      fileName: outZim,
      fullTextIndexLanguage: dump.opts.withoutZimFullTextIndex ? '' : dump.mwMetaData.langIso3,
      welcome: 'A/' + (dump.opts.mainPage ? dump.getArticleBase(dump.opts.mainPage) : 'index'),
    }, {
        favicon: 'I/favicon.png',
        Tags: dump.computeZimTags(),
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
      finalCss,
    } = await getAndProcessStylesheets(downloader, stylesheetsToGet);
    logger.log(`Downloaded stylesheets`);

    const article = new ZimArticle({ url: `style.css`, data: finalCss, ns: '-' });
    await zimCreator.addArticle(article);
    await saveFavicon(dump, zimCreator);

    logger.log(`Updating article thumbnails for all articles`);
    if (!customMainPage && articleList && articleListLines.length > MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE) {
      await mapLimit(articleListLines, downloader.speed, async (articleId) => {
        articleId = articleId.replace(/ /g, '_');
        try {
          const articleDetail = await articleDetailXId.get(articleId);
          if (!articleDetail) {
            return null;
          }
          const imageUrl = articleDetail.thumbnail;
          if (imageUrl) {
            const { mult: oldMult, width: oldWidth } = getSizeFromUrl(imageUrl.source);
            const suitableResUrl = imageUrl.source.replace(`/${oldWidth}px-`, '/500px-');
            const { mult, width } = getSizeFromUrl(suitableResUrl);
            const path = getMediaBase(suitableResUrl, false);
            filesToDownloadXPath.set(path, { url: suitableResUrl, namespace: 'I', mult, width });

            const resourceNamespace = 'I';
            const internalSrc = `../${resourceNamespace}/` + getMediaBase(suitableResUrl, true);

            articleDetail.internalThumbnailUrl = internalSrc;
            await articleDetailXId.set(articleId, articleDetail);
          }
        } catch (err) {
          logger.warn(`Failed to parse thumbnail for [${articleId}], skipping...`);
          return null;
        }
      });
    }
    logger.log(`Getting Main Page`);
    await getMainPage(dump, zimCreator);

    logger.log(`Getting articles`);
    const { jsModuleDependencies, cssModuleDependencies } = await saveArticles(zimCreator, redis, downloader, mw, dump);

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

    await downloadFiles(zimCreator, downloader);

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
            readFilePromise(faviconPath, null)
              .then((faviconContent) => {
                const article = new ZimArticle({ url: 'favicon.png', data: faviconContent, ns: 'I' });
                return zimCreator.addArticle(article);
              })
              .then(resolve, reject);
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

      const articleIds = articleListLines.map((title) => title.replace(/ /g, '_'));

      const articlesWithImages: ArticleDetail[] = [];
      const articlesWithoutImages: ArticleDetail[] = [];
      const allArticles: ArticleDetail[] = [];
      for (const articleId of articleIds) {
        const articleDetail = await articleDetailXId.get(articleId);
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
