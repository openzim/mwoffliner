// tslint:disable-next-line: no-reference
///<reference path="./types.d.ts" />

/* ********************************** */
/* MODULE VARIABLE SECTION ********** */
/* ********************************** */

import domino from 'domino';
import fs, { readFileSync } from 'fs';
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
import Redis from './redis';
import { writeFilePromise, mkdirPromise, isValidEmail, genHeaderCSSLink, genHeaderScript, saveStaticFiles, readFilePromise, makeArticleImageTile, makeArticleListItem, getDumps, getMediaBase, MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE, removeDuplicatesAndLowRes, downloadAndSaveModule, getSizeFromUrl, getRelativeFilePath } from './util';
import { mapLimit } from 'promiso';
import { ZimCreatorFs } from './ZimCreatorFs';
import logger from './Logger';
import { getAndProcessStylesheets } from './util';
import { Dump } from './Dump';
import { getArticleIds } from './util/redirects';
import { articleListHomeTemplate } from './Templates';
import { saveArticles, downloadFiles } from './util/saveArticles';
import { getCategoriesForArticles, trimUnmirroredPages } from './util/categories';
import { filesToDownloadXPath, populateFilesToDownload, articleDetailXId, populateArticleDetail, populateRequestCache, requestCacheXUrl, populateRedirects, filesToRetryXPath, populateFilesToRetry, redirectsXId } from './stores';
const packageJSON = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

function closeRedis(redis: Redis) {
  logger.log(`Flushing Redis DBs`);
  if (redis.redisClient.connected) {
    filesToDownloadXPath.flush();
    filesToRetryXPath.flush();
    articleDetailXId.flush();
    requestCacheXUrl.flush();
    redirectsXId.flush();
    redis.redisClient.quit();
  }
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
    noLocalParserFallback,
  } = argv;

  (process as any).verbose = !!verbose;

  /* Setup redis client */
  const redis = new Redis(argv, config);
  populateArticleDetail(redis.redisClient);
  populateRedirects(redis.redisClient);
  populateFilesToDownload(redis.redisClient);
  populateFilesToRetry(redis.redisClient);
  populateRequestCache(redis.redisClient);

  let articleList = _articleList ? String(_articleList) : _articleList;
  const publisher = _publisher || config.defaults.publisher;
  let customZimFavicon = _customZimFavicon;

  const expandedOutputDirectory = homeDirExpander(_outputDirectory || 'out/');
  const outputDirectory = path.isAbsolute(expandedOutputDirectory) ?
    expandedOutputDirectory :
    path.join(process.cwd(), expandedOutputDirectory);
  await mkdirPromise(outputDirectory);

  const expandedCacheDirectory = homeDirExpander(_cacheDirectory || `cac/dumps-${Date.now()}/`);
  const cacheDirectory = path.isAbsolute(expandedCacheDirectory) ?
    expandedCacheDirectory :
    path.join(process.cwd(), expandedCacheDirectory);
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
    closeRedis(redis);
    logger.log(`Exiting with code [${code}]`);
    logger.log(`Deleting tmp dump dir [${dumpTmpDir}]`);
    rimraf.sync(dumpTmpDir);
    logger.log(`Clearing Cache Directory`);
    rimraf.sync(cacheDirectory);
  });

  process.on('SIGTERM', () => {
    logger.log(`SIGTERM`);
    closeRedis(redis);
    process.exit(128 + 15);
  });
  process.on('SIGINT', () => {
    logger.log(`SIGINT`);
    closeRedis(redis);
    process.exit(128 + 2);
  });

  /* HTTP user-agent string */
  // const adminEmail = argv.adminEmail;
  if (!isValidEmail(adminEmail)) { throw new Error(`Admin email [${adminEmail}] is not valid`); }

  /* Number of parallel requests */
  if (_speed && isNaN(_speed)) { throw new Error('speed is not a number, please give a number value to --speed'); }
  const cpuCount = os.cpus().length;
  const speed = Math.max(1, Math.round(cpuCount * (_speed || 1) * 3));

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
  const downloader = new Downloader({
    mw,
    uaString: `${config.userAgent} (${adminEmail})`,
    speed,
    reqTimeout: requestTimeout || config.defaults.requestTimeout,
    useCache,
    cacheDirectory,
    noLocalParserFallback,
  });

  await downloader.checkCapabilities();

  /* Get MediaWiki Info */
  let mwMetaData;
  try {
    mwMetaData = await mw.getMwMetaData(downloader);
  } catch (err) {
    logger.error(`FATAL - Failed to get MediaWiki Metadata`);
    throw err;
  }

  const mainPage = customMainPage || (articleList ? '' : mwMetaData.mainPage);

  /* *********************************** */
  /*       SYSTEM VARIABLE SECTION       */
  /* *********************************** */

  const dumpFormats = getDumps(format);

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
  await getArticleIds(downloader, mw, mainPage, articleList ? articleListLines : null);
  if (mw.getCategories) {
    await getCategoriesForArticles(articleDetailXId, downloader, redis);

    while ((await trimUnmirroredPages(downloader)) > 0) { // Remove unmirrored pages, categories, subCategories
      // trimUnmirroredPages returns number of modified articles
    }

    // while ((await simplifyGraph(downloader)).deletedNodes !== 0) {
    //   // keep simplifying graph
    // }
    // await trimUnmirroredPages(downloader); // TODO: improve simplify graph to remove the need for a second trim
  }

  const dumps: Dump[] = [];

  for (const dumpFormat of dumpFormats) {
    const dump = new Dump(dumpFormat, {
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
    dumps.push(dump);
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
    dump.outFile = outZim;

    logger.log(`Flushing redis file store`);
    await filesToDownloadXPath.flush();
    await filesToRetryXPath.flush();

    const zimCreatorConstructor = dump.nozim ? ZimCreatorFs : ZimCreator;

    const zimCreator = new zimCreatorConstructor({
      fileName: outZim,
      fullTextIndexLanguage: dump.opts.withoutZimFullTextIndex ? '' : dump.mwMetaData.langIso3,
      welcome: (dump.opts.mainPage ? dump.getArticleBase(dump.opts.mainPage) : 'index'),
    }, {
        Tags: dump.computeZimTags(),
        Language: dump.mwMetaData.langIso3,
        Title: dump.opts.customZimTitle || dump.mwMetaData.title,
        Name: zimName,
        Description: dump.opts.customZimDescription || dump.mwMetaData.subTitle || zimName,
        Creator: dump.mwMetaData.creator,
        Publisher: dump.opts.publisher,
      });
    const scraperArticle = new ZimArticle({
      ns: 'M',
      data: `mwoffliner ${packageJSON.version}`,
      url: 'Scraper',
    });
    await zimCreator.addArticle(scraperArticle);

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

    if (!customMainPage && articleList && articleListLines.length > MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE) {
      logger.log(`Updating article thumbnails for articles`);
      let articleIndex = 0;
      let articlesWithImages = 0;
      await mapLimit(','.repeat(downloader.speed).split(','), downloader.speed, async () => {
        while (articleIndex < articleListLines.length && articlesWithImages <= 100) {
          const articleId = articleListLines[articleIndex].replace(/ /g, '_');
          articleIndex += 1;
          try {
            const articleDetail = await articleDetailXId.get(articleId);
            if (!articleDetail) {
              continue;
            }
            const imageUrl = articleDetail.thumbnail;
            if (imageUrl) {
              const { mult: oldMult, width: oldWidth } = getSizeFromUrl(imageUrl.source);
              const suitableResUrl = imageUrl.source.replace(`/${oldWidth}px-`, '/500px-');
              const { mult, width } = getSizeFromUrl(suitableResUrl);
              const path = getMediaBase(suitableResUrl, false);

              const internalSrc = getRelativeFilePath('Main_Page', getMediaBase(suitableResUrl, true), 'I');

              articlesWithImages += 1;

              await filesToDownloadXPath.set(path, { url: suitableResUrl, namespace: 'I', mult, width });
              articleDetail.iThumb = internalSrc;
              await articleDetailXId.set(articleId, articleDetail);
            }
          } catch (err) {
            logger.warn(`Failed to parse thumbnail for [${articleId}], skipping...`);
          }
        }
      });
    }
    logger.log(`Getting Main Page`);
    await getMainPage(dump, zimCreator);

    logger.log(`Getting articles`);
    const { jsModuleDependencies, cssModuleDependencies } = await saveArticles(zimCreator, downloader, mw, dump);

    logger.log(`Found [${jsModuleDependencies.size}] js module dependencies`);
    logger.log(`Found [${cssModuleDependencies.size}] style module dependencies`);

    const allDependenciesWithType = [
      { type: 'js', moduleList: Array.from(jsModuleDependencies) },
      { type: 'css', moduleList: Array.from(cssModuleDependencies) },
    ];

    logger.log(`Downloading module dependencies`);
    await Promise.all(allDependenciesWithType.map(async ({ type, moduleList }) => {
      return await mapLimit(moduleList, downloader.speed, (oneModule) => {
        return downloadAndSaveModule(zimCreator, mw, downloader, dump, oneModule, type as any);
      });
    }));

    await downloadFiles(filesToDownloadXPath, zimCreator, dump, downloader);

    logger.log(`Writing Article Redirects`);
    await writeArticleRedirects(downloader, dump, zimCreator);

    logger.log(`Finishing Zim Creation`);
    await zimCreator.finalise();

    logger.log(`Summary of scrape actions:`, JSON.stringify(dump.status, null, '\t'));
  }

  /* ********************************* */
  /* FUNCTIONS *********************** */
  /* ********************************* */

  async function writeArticleRedirects(downloader: Downloader, dump: Dump, zimCreator: ZimCreator) {
    await articleDetailXId.iterateItems(
      downloader.speed,
      async (articles) => {
        for (const [articleId, articleDetail] of Object.entries(articles)) {
          for (const redirect of articleDetail.redirects || []) {
            const redirectId = redirect.title.replace(/ /g, '_');
            if (redirectId !== articleId) {
              const redirectArticle = new ZimArticle({
                url: redirectId + (dump.nozim ? '.html' : ''),
                shouldIndex: true,
                data: '',
                ns: 'A',
                mimeType: 'text/html',
                title: redirect.title,
                redirectAid: `${articleId}` + (dump.nozim ? '.html' : ''),
              });
              await zimCreator.addArticle(redirectArticle);
              dump.status.redirects.written += 1;
            }
          }
        }
      },
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
                const article = new ZimArticle({ url: 'favicon', mimeType: 'image/png', data: faviconContent, ns: '-' });
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
        doc.body.innerHTML = `<div id='container'><div id='content'>${articlesWithImagesEl}</div></div>`;
      } else {
        const articlesWithoutImagesEl = allArticles.map((article) => makeArticleListItem(dump, article)).join('\n');
        doc.body.innerHTML = `<ul id='list'>${articlesWithoutImagesEl}</ul>`;
      }

      /* Write the static html file */
      const article = new ZimArticle({ url: 'index' + (dump.nozim ? '.html' : ''), data: doc.documentElement.outerHTML, ns: 'A', mimeType: 'text/html', title: 'Main Page' });
      return zimCreator.addArticle(article);
    }

    function createMainPageRedirect() {
      logger.log(`Create main page redirection from [index] to[${'A/' + dump.getArticleBase(mainPage, true)}]`);
      const article = new ZimArticle({
        url: 'index' + (dump.nozim ? '.html' : ''),
        shouldIndex: true,
        data: '',
        ns: 'A',
        mimeType: 'text/html',
        title: mainPage,
        redirectAid: mainPage,
      });
      return zimCreator.addArticle(article);
    }

    if (mainPage) {
      return createMainPageRedirect();
    } else {
      return createMainPage();
    }
  }

  closeRedis(redis);

  return dumps;
}

export {
  execute,
};
