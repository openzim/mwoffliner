// tslint:disable-next-line: no-reference
///<reference path="./types.d.ts" />

/* ********************************** */
/* MODULE VARIABLE SECTION ********** */
/* ********************************** */

import fs, { readFileSync } from 'fs';
import os from 'os';
import pmap from 'p-map';
import axios from 'axios';
import sharp from 'sharp';
import domino from 'domino';
import rimraf from 'rimraf';
import urlParser from 'url';
import semver from 'semver';
import * as path from 'path';
import * as QueryStringParser from 'querystring';
import { ZimArticle, ZimCreator } from '@openzim/libzim';

import {
  articleDetailXId,
  filesToDownloadXPath,
  filesToRetryXPath,
  populateArticleDetail,
  populateFilesToDownload,
  populateFilesToRetry,
  populateRedirects,
  redirectsXId
} from './stores';
import {
  downloadAndSaveModule,
  genCanonicalLink,
  genHeaderCSSLink,
  genHeaderScript,
  getAndProcessStylesheets,
  getDumps,
  getMediaBase,
  getRelativeFilePath,
  getSizeFromUrl,
  isValidEmail,
  makeArticleImageTile,
  makeArticleListItem,
  MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE,
  mkdirPromise,
  readFilePromise,
  sanitizeString,
  saveStaticFiles,
  writeFilePromise,
  importPolyfillModules,
} from './util';
import S3 from './S3';
import Redis from './Redis';
import logger from './Logger';
import { Dump } from './Dump';
import { config } from './config';
import MediaWiki from './MediaWiki';
import Downloader from './Downloader';
import { getArticleIds } from './util/redirects';
import { articleListHomeTemplate } from './Templates';
import { downloadFiles, saveArticles } from './util/saveArticles';
import { getCategoriesForArticles, trimUnmirroredPages } from './util/categories';


const packageJSON = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

function closeRedis(redis: Redis) {
  logger.log(`Flushing Redis DBs`);
  if (redis.client.connected) {
    filesToDownloadXPath.flush();
    filesToRetryXPath.flush();
    articleDetailXId.flush();
    redirectsXId.flush();
    redis.client.quit();
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
    mwRestApiPath,
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
    webp,
    format,
    filenamePrefix,
    resume,
    publisher: _publisher,
    outputDirectory: _outputDirectory,
    addNamespaces: _addNamespaces,
    articleList: _articleList,
    customZimFavicon: _customZimFavicon,
    optimisationCacheUrl,
    noLocalParserFallback,
    forceLocalParser,
    customFlavour,
    zstd,
  } = argv;

  (process as any).verbose = !!verbose;

  logger.log(`Starting mwoffliner v${packageJSON.version}...`);

  let articleList = _articleList ? String(_articleList) : _articleList;
  const publisher = _publisher || config.defaults.publisher;
  let customZimFavicon = _customZimFavicon;

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

  /* Instanciate custom flavour module */
  logger.info(`Using custom flavour: ${customFlavour || 'no'}`);
  const customProcessor = customFlavour ?
    new(require(customFlavour)) : null;

  // Check for S3 creds
  if (optimisationCacheUrl) {
    // Decompose the url with path and other S3 creds
    const s3UrlObj = urlParser.parse(optimisationCacheUrl);
    const queryReader = QueryStringParser.parse(s3UrlObj.query);
    const s3Url = (s3UrlObj.host || '') + (s3UrlObj.pathname || '');
    this.s3Obj = new S3(s3Url, queryReader);
    await this.s3Obj.initialise().then(() => {
      logger.log('Successfully logged in S3');
    });
  }

  // Extract S3 obj to pass to downloader class
  const s3 = this.s3Obj ? this.s3Obj : {};

  /* Wikipedia/... URL; Normalize by adding trailing / as necessary */
  const mw = new MediaWiki({
    getCategories: !!argv.getCategories,
    apiPath: mwApiPath,
    restApiPath: mwRestApiPath,
    modulePath: mwModulePath,
    base: mwUrl,
    domain: mwDomain,
    password: mwPassword,
    username: mwUsername,
    wikiPath: mwWikiPath,
  });

  /* Download helpers; TODO: Merge with something else / expand this. */
  const downloader = new Downloader({
    mw,
    uaString: `${config.userAgent} (${adminEmail})`,
    speed,
    reqTimeout: requestTimeout || config.defaults.requestTimeout,
    noLocalParserFallback,
    forceLocalParser,
    optimisationCacheUrl,
    s3,
    webp,
  });

  /* Get MediaWiki Info */
  let mwMetaData;
  try {
    mwMetaData = await mw.getMwMetaData(downloader);
  } catch (err) {
    logger.error(`FATAL - Failed to get MediaWiki Metadata`);
    throw err;
  }
  const mainPage = customMainPage || (articleList ? '' : mwMetaData.mainPage);

  await downloader.checkCapabilities(mwMetaData.mainPage);
  await downloader.setBaseUrls();

  const redis = new Redis(argv, config);
  populateArticleDetail(redis.client);
  populateRedirects(redis.client);
  populateFilesToDownload(redis.client);
  populateFilesToRetry(redis.client);

  // Output directory
  const outputDirectory = path.isAbsolute(_outputDirectory || '') ?
    _outputDirectory : path.join(process.cwd(), _outputDirectory || 'out');
  await mkdirPromise(outputDirectory);
  logger.log(`Using output directory ${outputDirectory}`);

  // Temporary directory
  const tmpDirectory = path.resolve(os.tmpdir(), `mwoffliner-${Date.now()}`);
  try {
    logger.info(`Creating temporary directory [${tmpDirectory}]`);
    await mkdirPromise(tmpDirectory);
  } catch (err) {
    logger.error(`Failed to create temporary directory, exiting`, err);
    throw err;
  }
  logger.log(`Using temporary directory ${tmpDirectory}`);

  process.on('exit', async (code) => {
    logger.log(`Exiting with code [${code}]`);
    logger.log(`Deleting temporary directory [${tmpDirectory}]`);
    rimraf.sync(tmpDirectory);
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

  /* *********************************** */
  /*       SYSTEM VARIABLE SECTION       */
  /* *********************************** */

  const dumpFormats = getDumps(format);

  const addNamespaces = _addNamespaces ? String(_addNamespaces).split(',').map((a: string) => Number(a)) : [];

  /* ZIM custom Favicon */
  if (customZimFavicon) {
    const faviconPath = path.join(tmpDirectory, 'favicon.png');
    const faviconIsRemote = customZimFavicon.includes('http');
    logger.log(`${faviconIsRemote ? 'Downloading' : 'Moving'} custom favicon to [${faviconPath}]`);
    let content;
    if (faviconIsRemote) {
      logger.log(`Downloading remote zim favicon from [${customZimFavicon}]`);
      content = await axios.get(customZimFavicon, downloader.arrayBufferRequestOptions)
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
      const tmpArticleListPath = path.join(tmpDirectory, fileName);
      logger.log(`Downloading article list from [${articleList}] to [${tmpArticleListPath}]`);
      const { data: articleListContentStream } = await axios.get(articleList, downloader.streamRequestOptions);
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
    articleListLines = articleList ? fs.readFileSync(articleList).toString().split('\n').filter((a) => a) : [];
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

  const filenameDate = (new Date()).toISOString().slice(0, 7);

  // Getting total number of articles from Redis
  logger.log(`Total articles found in Redis: ${await articleDetailXId.len()}`);


  const dumps: Dump[] = [];

  for (const dumpFormat of dumpFormats) {
    const dump = new Dump(dumpFormat, {
      tmpDir: tmpDirectory,
      username: mwUsername,
      password: mwPassword,
      outputDirectory,
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
      filenameDate
    },
      { ...mwMetaData, mainPage },
      customProcessor,
    );
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
    const outZim = path.resolve(dump.opts.outputDirectory, dump.computeFilenameRadical() + '.zim');
    logger.log(`Writing zim to [${outZim}]`);
    dump.outFile = outZim;

    const zimCreator = new ZimCreator({
      fileName: outZim,
      fullTextIndexLanguage: dump.opts.withoutZimFullTextIndex ? '' : dump.mwMetaData.langIso3,
      welcome: (dump.opts.mainPage ? dump.opts.mainPage : 'index'),
      compression: zstd ? 'zstd' : 'lzma',
    }, {
      Tags: dump.computeZimTags(),
      Language: dump.mwMetaData.langIso3,
      Title: dump.opts.customZimTitle || dump.mwMetaData.title,
      Name: dump.computeFilenameRadical(false, true, true),
      Flavour: dump.computeFlavour(),
      Description: dump.opts.customZimDescription || dump.mwMetaData.subTitle,
      Creator: dump.mwMetaData.creator,
      Publisher: dump.opts.publisher,
    });
    const scraperArticle = new ZimArticle({
      ns: 'M',
      data: `mwoffliner ${packageJSON.version}`,
      url: 'Scraper',
    });
    zimCreator.addArticle(scraperArticle);

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

    const article = new ZimArticle({ url: `${config.output.dirs.mediawiki}/style.css`, data: finalCss, ns: '-' });
    zimCreator.addArticle(article);
    await saveFavicon(dump, zimCreator);

    await getThumbnailsData();

    logger.log(`Getting Main Page`);
    await getMainPage(dump, zimCreator, downloader);

    logger.log(`Getting articles`);
    const { jsModuleDependencies, cssModuleDependencies } = await saveArticles(zimCreator, downloader, mw, dump);

    logger.log(`Found [${jsModuleDependencies.size}] js module dependencies`);
    logger.log(`Found [${cssModuleDependencies.size}] style module dependencies`);

    const allDependenciesWithType = [
      { type: 'js', moduleList: Array.from(jsModuleDependencies) },
      { type: 'css', moduleList: Array.from(cssModuleDependencies) },
    ];

    if (downloader.webp) {
      logger.log('Downloading polyfill module');
      importPolyfillModules(zimCreator);
    }

    logger.log(`Downloading module dependencies`);
    await Promise.all(allDependenciesWithType.map(async ({ type, moduleList }) => {
      return await pmap(moduleList, (oneModule) => {
        return downloadAndSaveModule(zimCreator, mw, downloader, dump, oneModule, type as any);
      }, { concurrency: downloader.speed });
    }));

    await downloadFiles(filesToDownloadXPath, zimCreator, dump, downloader);

    logger.log(`Flushing Redis file store`);
    await filesToDownloadXPath.flush();
    await filesToRetryXPath.flush();

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
    await redirectsXId.iterateItems(
      downloader.speed,
      async (redirects) => {
        for (const [redirectId, { targetId, title }] of Object.entries(redirects)) {
          if (redirectId !== targetId) {
            const redirectArticle = new ZimArticle({
              url: redirectId,
              shouldIndex: true,
              data: '',
              ns: 'A',
              mimeType: 'text/html',

              // We fake a title, by just removing the underscores
              title: String(redirectId).replace(/_/g, ' '),

              redirectUrl: targetId,
            });
            zimCreator.addArticle(redirectArticle);
            dump.status.redirects.written += 1;
          }
        }
      },
    );
  }

  async function saveFavicon(dump: Dump, zimCreator: ZimCreator): Promise<{}> {
    logger.log('Saving favicon.png...');

    async function saveFavicon(zimCreator: ZimCreator, faviconPath: string): Promise<{}> {
      try {
        const source = await fs.promises.readFile(faviconPath);
        const data = await sharp(source).resize(48, 48).toBuffer();
        const article = new ZimArticle({ url: 'favicon', mimeType: 'image/png', data, ns: '-' });
        return zimCreator.addArticle(article);
      } catch (e) {
        throw new Error('Failed to save favicon using sharp');
      }
    }

    if (customZimFavicon) {
      return await saveFavicon(zimCreator, customZimFavicon);
    }
    const body = await downloader.getJSON<any>(mw.siteInfoUrl());
    const entries = body.query.general;
    if (!entries.logo) {
      throw new Error(`********\nNo site Logo Url. Expected a string, but got [${entries.logo}].\n\nPlease try specifying a customZimFavicon (--customZimFavicon=./path/to/your/file.ico)\n********`);
    }

    const parsedUrl = urlParser.parse(entries.logo);
    const ext = parsedUrl.pathname.split('.').slice(-1)[0];

    const faviconPath = path.join(tmpDirectory, `favicon.${ext}`);
    const logoUrl = parsedUrl.protocol ? entries.logo : 'http:' + entries.logo;
    const logoContent = await downloader.downloadContent(logoUrl);
    await writeFilePromise(faviconPath, logoContent.content, null);
    return await saveFavicon(zimCreator, faviconPath);
  }

  function getMainPage(dump: Dump, zimCreator: ZimCreator, downloader: Downloader) {
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
            genCanonicalLink(config, dump.mwMetaData.webUrl, dump.mwMetaData.mainPage) + '\n' +
            '\n</head>'),
      );
      doc.querySelector('title').innerHTML = sanitizeString(dump.mwMetaData.title) || sanitizeString(dump.opts.customZimTitle);
      const articlesWithImages: ArticleDetail[] = [];
      const allArticles: ArticleDetail[] = [];
      for (const articleId of articleListLines) {
        const articleDetail = await articleDetailXId.get(articleId);
        if (articleDetail) {
          allArticles.push(articleDetail);
          if (articleDetail.thumbnail) {
            articlesWithImages.push(articleDetail);
            if (articlesWithImages.length >= 100) {
              break;
            }
          }
        }
      }

      if (articlesWithImages.length > MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE) {
        const articlesWithImagesEl = articlesWithImages.map((article) => makeArticleImageTile(dump, article, downloader.webp)).join('\n');
        doc.body.innerHTML = `<div id='container'><div id='content'>${articlesWithImagesEl}</div></div>`;
      } else {
        const articlesWithoutImagesEl = allArticles.map((article) => makeArticleListItem(dump, article)).join('\n');
        doc.body.innerHTML = `<ul id='list'>${articlesWithoutImagesEl}</ul>`;
      }

      /* Write the static html file */
      const article = new ZimArticle({ url: 'index', data: doc.documentElement.outerHTML, ns: 'A', mimeType: 'text/html', title: 'Main Page' });
      return zimCreator.addArticle(article);
    }

    function createMainPageRedirect() {
      logger.log(`Create main page redirection from [index] to [${'A/' + mainPage}]`);
      const article = new ZimArticle({
        url: 'index',
        shouldIndex: true,
        data: '',
        ns: 'A',
        mimeType: 'text/html',
        title: mainPage,
        redirectUrl: mainPage,
      });
      return zimCreator.addArticle(article);
    }

    return mainPage ? createMainPageRedirect() : createMainPage();
  }

  async function getThumbnailsData(): Promise<void> {
    if (customMainPage || !articleList || articleListLines.length <= MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE) return;
    logger.log(`Updating article thumbnails for articles`);
    let articleIndex = 0;
    let articlesWithImages = 0;

    while (articleIndex < articleListLines.length && articlesWithImages <= 100) {
      const articleId = articleListLines[articleIndex];
      articleIndex++;
      try {
        const articleDetail = await articleDetailXId.get(articleId);
        if (!articleDetail) continue;

        const imageUrl = articleDetail.thumbnail;
        if (!imageUrl) continue;

        const { width: oldWidth } = getSizeFromUrl(imageUrl.source);
        const suitableResUrl = imageUrl.source
          .replace(`/${oldWidth}px-`, '/500px-')
          .replace(`-${oldWidth}px-`, '-500px-');
        const { mult, width } = getSizeFromUrl(suitableResUrl);
        const path = getMediaBase(suitableResUrl, false);
        articleDetail.internalThumbnailUrl = getRelativeFilePath('Main_Page', getMediaBase(suitableResUrl, true), 'I');

        await Promise.all([
          filesToDownloadXPath.set(path, { url: downloader.serializeUrl(suitableResUrl), mult, width }),
          articleDetailXId.set(articleId, articleDetail)
        ]);
        articlesWithImages++;
      } catch (err) {
        logger.warn(`Failed to parse thumbnail for [${articleId}], skipping...`);
      }
    }
  }

  closeRedis(redis);

  return dumps;
}

export {
  execute
};
