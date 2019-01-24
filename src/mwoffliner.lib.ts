/* ********************************** */
/* MODULE VARIABLE SECTION ********** */
/* ********************************** */

import async from 'async';
import { exec } from 'child_process';
import crypto from 'crypto';
import domino from 'domino';
import fs, { unlinkSync } from 'fs';
import htmlMinifier from 'html-minifier';
import fetch from 'node-fetch';
import os from 'os';
import pathParser from 'path';
import swig from 'swig-templates';
import urlParser, { URL } from 'url';
import unicodeCutter from 'utf8-binary-cutter';
import zlib from 'zlib';
import semver from 'semver';
import * as path from 'path';
import ServiceRunner from 'service-runner';
import axios from 'axios';
import { ZimCreator, ZimArticle } from 'libzim-binding';
import homeDirExpander from 'expand-home-dir';
import rimraf from 'rimraf';

import config from './config';
import DU from './DOMUtils';
import Downloader from './Downloader';
import Logger from './Logger';
import MediaWiki from './MediaWiki';
import OfflinerEnv from './OfflinerEnv';
import parameterList from './parameterList';
import Redis from './redis';
import { contains, getCreatorName, checkDependencies, doSeries, writeFilePromise, getStringsForLang, mkdirPromise, computeHtmlRootPath } from './util';
import packageJSON from '../package.json';
import { ZimCreatorFs } from './ZimCreatorFs';
import logger from './Logger';
import { getArticleThumbnails, parseDump, getAndProcessStylesheets } from './util/dump';
import { Dump } from './Dump';
import { getMwMetaData } from './util/mediaWiki';

function getParametersList() {
  // Want to remove this anonymous function. Need to investigate to see if it's needed
  return parameterList;
}

async function execute(argv) {
  /* ********************************* */
  /* CUSTOM VARIABLE SECTION ********* */
  /* ********************************* */

  const {
    speed: _speed,
    adminEmail,
    localMcs,
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
    writeHtmlRedirects,
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

  let mcsUrl: string;

  let articleList = _articleList ? String(_articleList) : _articleList;
  const publisher = _publisher || config.defaults.publisher;
  let customZimFavicon = _customZimFavicon;

  const __cacheDirectory = _cacheDirectory || pathParser.resolve(process.cwd(), 'cac');

  const outputDirectory = _outputDirectory ? `${homeDirExpander(_outputDirectory)}/` : 'out/';
  const cacheDirectory = `${__cacheDirectory + env.computeFilenameRadical(true, true, true)}/`;
  const tmpDirectory = _tmpDirectory ? `${homeDirExpander(_tmpDirectory)}/` : 'tmp/';

  /* HTTP user-agent string */
  // const adminEmail = argv.adminEmail;
  if (!U.isValidEmail(adminEmail)) { throw new Error(`Admin email [${adminEmail}] is not valid`); }

  /* Number of parallel requests */
  if (_speed && isNaN(_speed)) { throw new Error('speed is not a number, please give a number value to --speed'); }
  const cpuCount = os.cpus().length;
  const speed = cpuCount * (_speed || 1);

  /* Necessary to avoid problems with https */
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const runner = new ServiceRunner();

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
    requestTimeout || config.defaults.requestTimeout,
  );

  /* Get MediaWiki Info */

  const mwMetaData = await getMwMetaData();

  let mainPage = customMainPage || mwMetaData.mainPage;

  /* Get language specific strings */
  const strings = getStringsForLang(mwMetaData.langIso2 || 'en', 'en');

  /* *********************************** */
  /*       SYSTEM VARIABLE SECTION       */
  /* *********************************** */

  const zimOpts = {
    // Name to use for ZIM (content) creator
    creator: mwMetaData.creator,

    // ZIM publisher
    publisher: publisher || config.defaults.publisher,

    langIso2: 'en',
    langIso3: 'eng',

    // List of articles is maybe in a file
    articleList,

    mainPageId: customMainPage || '',
    name: customZimTitle || '',
    description: customZimDescription || '',
    tags: customZimTags || '',
    cacheDirectory: `${cacheDirectory || pathParser.resolve(process.cwd(), 'cac')}/`,

    // File where redirects might be save if --writeHtmlRedirects is not set
    redirectsFile: null,

    // Directory wehre everything is saved at the end of the process
    outputDirectory,

    // Directory where temporary data are saved
    tmpDirectory,

    // Include fulltext index in ZIM file
    // withZimFullTextIndex,

    // What is this?
    subTitle: '',
  };
  // const zim = new Zim(config, zimOpts);

  // Temporary stub env for now to encapsulate state and pass around
  // where it is required. This might eventually take a different form
  // after refactoring is complete.
  // const env = new OfflinerEnv(format, {
  //   // zim,
  //   mw,
  //   logger,
  //   downloader,
  //   verbose,

  //   // Prefix part of the filename (radical)
  //   filenamePrefix: filenamePrefix || '',

  //   // If ZIM is built, should temporary HTML directory be kept
  //   keepHtml,

  //   // Should we keep ZIM file generation if ZIM file already exists
  //   resume,

  //   deflateTmpHtml,

  //   // How to write redirects
  //   writeHtmlRedirects,
  // });

  const dumps = ['']
  if (format) {
    if (format instanceof Array) {
      this.dumps = [];
      const self = this;
      format.forEach((value) => {
        self.dumps.push(value === true ? '' : value);
      });
    } else if (format !== true) {
      this.dumps = [format];
    }
  }

  const INFINITY_WIDTH = 9999999;
  const articleDetailXId = {};
  const webUrlHost = urlParser.parse(mw.webUrl).host;
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

  let parsoidFallbackUrl: string;

  if (localMcs) {
    // Start Parsoid
    logger.log('Starting Parsoid & MCS');

    await runner.start({
      num_workers: 0,
      services: [{
        name: 'parsoid',
        module: 'node_modules/parsoid/lib/index.js',
        entrypoint: 'apiServiceWorker',
        conf: {
          mwApis: [{
            uri: `${mw.base + mw.apiPath}`,
          }],
        },
      }, {
        name: 'mcs',
        module: 'node_modules/service-mobileapp-node/app.js',
        conf: {
          port: 6927,
          mwapi_req: {
            method: 'post',
            uri: `https://{{domain}}/${mw.apiPath}`,
            headers: {
              'user-agent': '{{user-agent}}',
            },
            body: '{{ default(request.query, {}) }}',
          },
          restbase_req: {
            method: '{{request.method}}',
            uri: 'http://localhost:8000/{{domain}}/v3/{+path}',
            query: '{{ default(request.query, {}) }}',
            headers: '{{request.headers}}',
            body: '{{request.body}}',
          },
        },
      }],
      logging: {
        level: 'info',
      },
    });
    const domain = (new URL(mw.base)).host;
    mcsUrl = `http://localhost:6927/${domain}/v1/page/mobile-sections/`;
    parsoidFallbackUrl = `http://localhost:8000/${webUrlHost}/v3/page/pagebundle/`;
  } else {
    mcsUrl = `${mw.base}api/rest_v1/page/mobile-sections/`;
    parsoidFallbackUrl = `${mw.apiUrl}action=visualeditor&format=json&paction=parse&page=`;
  }

  /* ********************************* */
  /* RUNNING CODE ******************** */
  /* ********************************* */

  // await checkDependencies(env);

  /* Setup redis client */
  const redis = new Redis(argv, config);

  /* Some helpers */
  function readTemplate(t) {
    return fs.readFileSync(pathParser.resolve(__dirname, '../res', t), 'utf-8');
  }
  const { dirs } = config.output;
  function cssPath(css) {
    return [dirs.style, `${dirs.styleModules}-${css.replace(/(\.css)?$/, '')}.css`].join('/');
  }
  function jsPath(js) {
    return [dirs.javascript, `${dirs.jsModules}-${js.replace(/(\.js)?$/, '')}.js`].join('/');
  }
  function genHeaderCSSLink(css, classList = '') {
    return `<link href="${cssPath(css)}" rel="stylesheet" type="text/css" class="${classList}" />`;
  }
  function genHeaderScript(js, classList = '') {
    return `<script src="${jsPath(js)}" class="${classList}"></script>`;
  }

  const cssLinks = config.output.cssResources.reduce((buf, css) => {
    return buf + genHeaderCSSLink(css);
  }, '');

  const jsScripts = config.output.jsResources.reduce((buf, js) => {
    return buf + genHeaderScript(js);
  }, '');

  /* Compile templates */
  const redirectTemplate = swig.compile(readTemplate(config.output.templates.redirects));
  const footerTemplate = swig.compile(readTemplate(config.output.templates.footer));
  const leadSectionTemplate = swig.compile(readTemplate(config.output.templates.lead_section_wrapper));
  const sectionTemplate = swig.compile(readTemplate(config.output.templates.section_wrapper));
  const subSectionTemplate = swig.compile(readTemplate(config.output.templates.subsection_wrapper));

  /* ********************************** */
  /* CONSTANT VARIABLE SECTION ******** */
  /* ********************************** */

  const genericJsModules = config.output.mw.js;
  const genericCssModules = config.output.mw.css;

  const mediaRegex = /^(.*\/)([^/]+)(\/)(\d+px-|)(.+?)(\.[A-Za-z0-9]{2,6}|)(\.[A-Za-z0-9]{2,6}|)$/;
  const htmlTemplateCode = readTemplate(config.output.templates.page)
    .replace('__CSS_LINKS__', cssLinks)
    .replace('__JS_SCRIPTS__', jsScripts);
  const articleListHomeTemplate = readTemplate(config.output.templates.articleListHomeTemplate);

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
          .on('error', (err) => reject(err))
          .on('close', resolve);
      });
      articleList = tmpArticleListPath;
    } catch (err) {
      throw new Error(`Failed to download article list from [${articleList}]`);
    }
  }

  let articleListLines;
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
  if (useCache) {
    // await zim.prepareCache();
  }
  await env.checkResume();
  await getArticleIds(redirectQueue);

  const redirectsFile = path.join(dumpTmpDir, env.computeFilenameRadical(false, true, false) + '.redirects');
  await getRedirects(redirectsFile);

  for (let _dump of dumps) {
    const dump = new Dump(_dump, {
      username: mwUsername,
      password: mwPassword,
      spaceDelimiter: '_',
      outputDirectory,
      tmpDirectory,
      keepHtml,
      mainPage,
      filenamePrefix,
      articleList,
      publisher,
      customZimDescription,
      customZimTags,
      customZimTitle,
      withoutZimFullTextIndex,
    }, mwMetaData);
    logger.log(`Doing dump: [${dump}]`);
    await doDump(dump)
    logger.log(`Finished dump: [${dump}]`);
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
    const keepHtml = dump.nozim || dump.opts.keepHtml;
    const htmlRootPath = dump.computeHtmlRootPath();

    const zimName = (dump.opts.publisher ? `${dump.opts.publisher.toLowerCase()}.` : '') + dump.computeFilenameRadical(false, true, true);

    const outZim = pathParser.resolve(dump.opts.outputDirectory, dump.computeFilenameRadical() + '.zim');
    logger.log(`Writing zim to [${outZim}]`);

    const zimCreatorConstructor = dump.nozim ? ZimCreatorFs : ZimCreator;

    const zimCreator = new zimCreatorConstructor({
      fileName: outZim,
      fullTextIndexLanguage: dump.opts.withoutZimFullTextIndex ? '' : dump.mwMetaData.langIso3,
      welcome: dump.opts.mainPage ? env.getArticleBase(dump.opts.mainPage) : 'index.htm',
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



    // await zim.createSubDirectories();
    await saveStaticFiles(zimCreator);

    logger.info('Finding stylesheets to download');
    const stylesheetsToGet = await dump.getRelevantStylesheetUrls();
    logger.log(`Found [${stylesheetsToGet.length}] stylesheets to download`);

    logger.log(`Downloading stylesheets and populating media queue`);
    const {
      mediaItemsToDownload,
      finalCss
    } = await getAndProcessStylesheets(downloader, stylesheetsToGet);
    logger.log(`Downloaded stylesheets, media queue is [${mediaItemsToDownload.length}] items`);

    const article = new ZimArticle(`style.css`, finalCss, 'A');
    await zimCreator.addArticle(article);

    await saveStylesheet(zimCreator);
    await saveFavicon(zimCreator);

    if (articleList) {
      const thumbnailUrls = await getArticleThumbnails(downloader, articleListLines);
      if (thumbnailUrls.length > 10) {
        for (let { articleId, imageUrl } of thumbnailUrls) {
          downloadFileQueue.push({ url: imageUrl, zimCreator });
          const internalSrc = getMediaUrl(imageUrl);
          articleDetailXId[articleId] = Object.assign(
            articleDetailXId[articleId] || {},
            { thumbnail: internalSrc },
          );
        }
      }
    }

    await getMainPage(zimCreator);
    if (writeHtmlRedirects) { await saveHtmlRedirects(zimCreator); }
    await saveArticles(zimCreator, dump);
    await drainDownloadFileQueue(zimCreator);

    logger.log(`Finishing Zim Creation`);
    zimCreator.finalise();

    await redis.delMediaDB();
  }












  /* ********************************* */
  /* FUNCTIONS *********************** */
  /* ********************************* */


  function saveStaticFiles(zimCreator: ZimCreator) {
    const cssPromises = config.output.cssResources
      .concat(config.output.mainPageCssResources)
      .map(async (css) => {
        try {
          const cssCont = await U.readFilePromise(pathParser.resolve(__dirname, `../res/${css}.css`));
          const article = new ZimArticle(cssPath(css), cssCont, 'A');
          await zimCreator.addArticle(article);
        } catch (error) {
          logger.warn(`Could not create ${css} file : ${error}`);
        }
      });

    const jsPromises = config.output.jsResources.map(async (js) => {
      try {
        const jsCont = await U.readFilePromise(pathParser.resolve(__dirname, `../res/${js}.js`));
        const article = new ZimArticle(jsPath(js), jsCont, 'A');
        await zimCreator.addArticle(article);
      } catch (error) {
        logger.warn(`Could not create ${js} file : ${error}`);
      }
    });
    return Promise.all([
      ...cssPromises,
      ...jsPromises,
    ]);
  }

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
          downloadFileQueue.drain = function (error) {
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

  function getRedirects(redirectsFile) {
    logger.log('Reset redirects cache file (or create it)');
    fs.openSync(redirectsFile, 'w');

    logger.log('Storing redirects...');
    function cacheRedirect(redirectId, finished) {
      redis.getRedirect(redirectId, finished, (target) => {
        logger.info(`Storing redirect ${redirectId} (to ${target})...`);
        const line = 'A\t'
          + `${env.getArticleBase(redirectId)}\t`
          + `${redirectId.replace(/_/g, ' ')}\t`
          + `${env.getArticleBase(target, false)}\n`;
        fs.appendFile(redirectsFile, line, finished);
      });
    }

    return redis.processAllRedirects(speed, cacheRedirect,
      'Unable to cache a redirect',
      'All redirects were cached successfuly.',
    );
  }

  function saveHtmlRedirects(zimCreator: ZimCreator) {
    logger.log('Saving HTML redirects...');

    function saveHtmlRedirect(redirectId, finished) {
      redis.getRedirect(redirectId, finished, (target) => {
        logger.info(`Writing HTML redirect ${redirectId} (to ${target})...`);
        const data = redirectTemplate({
          target: env.getArticleUrl(target),
          title: redirectId.replace(/_/g, ' '),
          strings,
        });
        if (env.deflateTmpHtml) {
          zlib.deflate(data, (error, deflatedHtml) => {
            const article = new ZimArticle(redirectId + '.html', deflatedHtml, 'A', 'text/html', target);
            zimCreator.addArticle(article).then(finished, finished);
          });
        } else {
          const article = new ZimArticle(redirectId + '.html', data, 'A', 'text/html', target);
          zimCreator.addArticle(article).then(finished, finished);
        }
      });
    }

    return redis.processAllRedirects(
      speed,
      saveHtmlRedirect,
      'Unable to save a HTML redirect',
      'All redirects were saved successfuly as HTML files.',
    );
  }

  function saveArticles(zimCreator, dump) {
    return new Promise((resolve, reject) => {
      // these vars will store the list of js and css dependencies for the article we are downloading. they are populated in storeDependencies and used in setFooter
      let jsConfigVars: string | RegExpExecArray = '';
      let jsDependenciesList = [];
      let styleDependenciesList = [];

      function parseHtml(html, articleId, finished) {
        try {
          finished(null, domino.createDocument(html), articleId);
        } catch (error) {
          finished({ message: `Crash while parsing ${articleId}`, error });
        }
      }

      function storeDependencies(parsoidDoc, articleId, finished) {
        const articleApiUrl = mw.articleApiUrl(articleId);

        fetch(articleApiUrl, {
          headers: { Accept: 'application/json' },
          method: 'GET',
        })
          .then((response) => response.json())
          .then(async ({
            parse: {
              modules, modulescripts, modulestyles, headhtml,
            },
          }) => {
            jsDependenciesList = genericJsModules.concat(modules, modulescripts).filter((a) => a);
            styleDependenciesList = [].concat(modules, modulestyles, genericCssModules).filter((a) => a);

            styleDependenciesList = styleDependenciesList.filter(
              (oneStyleDep) => !contains(config.filters.blackListCssModules, oneStyleDep),
            );

            logger.info(`Js dependencies of ${articleId} : ${jsDependenciesList}`);
            logger.info(`Css dependencies of ${articleId} : ${styleDependenciesList}`);

            const allDependenciesWithType = [
              { type: 'js', moduleList: jsDependenciesList },
              { type: 'css', moduleList: styleDependenciesList },
            ];

            allDependenciesWithType.forEach(({ type, moduleList }) => moduleList.forEach((oneModule) => downloadAndSaveModule(oneModule, type as any)));

            // Saving, as a js module, the jsconfigvars that are set in the header of a wikipedia page
            // the script below extracts the config with a regex executed on the page header returned from the api
            const scriptTags = domino.createDocument(`${headhtml['*']}</body></html>`).getElementsByTagName('script');
            const regex = /mw\.config\.set\(\{.*?\}\);/mg;
            // tslint:disable-next-line:prefer-for-of
            for (let i = 0; i < scriptTags.length; i += 1) {
              if (scriptTags[i].text.includes('mw.config.set')) {
                jsConfigVars = regex.exec(scriptTags[i].text);
              }
            }
            jsConfigVars = `(window.RLQ=window.RLQ||[]).push(function() {${jsConfigVars}});`;
            jsConfigVars = jsConfigVars.replace('nosuchaction', 'view'); // to replace the wgAction config that is set to 'nosuchaction' from api but should be 'view'
            try {
              // fs.writeFileSync(pathParser.resolve(env.htmlRootPath, jsPath('jsConfigVars')), jsConfigVars);
              const article = new ZimArticle(jsPath('jsConfigVars'), jsConfigVars, 'A');
              await zimCreator.addArticle(article);
            } catch (e) {
              logger.warn('Error writing file', e);
            }

            finished(null, parsoidDoc, articleId);
          })
          .catch((e) => {
            logger.warn(`Error fetching api.php for ${articleApiUrl} ${e}`);
            finished(null, parsoidDoc, articleId); // calling finished here will allow zim generation to continue event if an article doesn't properly get its modules
          });

        function downloadAndSaveModule(module, type: 'js' | 'css') {
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
          function hackStartUpModule(jsCode) {
            return jsCode.replace(
              'script=document.createElement(\'script\');',
              `
                        document.body.addEventListener('fireStartUp', function () { startUp() }, false);
                        return;
                        script=document.createElement('script');`,
            );
          }
          function hackMediaWikiModule(jsCode) {
            jsCode += `(function () {
                const startUpEvent = new CustomEvent('fireStartUp');
                document.body.dispatchEvent(startUpEvent);
            })()`;
            return jsCode;
          }

          let moduleUri;
          let apiParameterOnly;
          if (type === 'js') {
            moduleUri = pathParser.resolve(env.htmlRootPath, jsPath(module));
            apiParameterOnly = 'scripts';
          } else if (type === 'css') {
            moduleUri = pathParser.resolve(env.htmlRootPath, cssPath(module));
            apiParameterOnly = 'styles';
          }

          const moduleApiUrl = encodeURI(
            `${mw.modulePath}?debug=false&lang=en&modules=${module}&only=${apiParameterOnly}&skin=vector&version=&*`,
          );
          logger.info(`Getting [${type}] module [${moduleApiUrl}]`);
          return redis.saveModuleIfNotExists(dump, module, moduleUri, type)
            .then((redisResult) => {
              if (redisResult === 1) {
                return fetch(moduleApiUrl, {
                  method: 'GET',
                  headers: { Accept: 'text/plain' },
                })
                  .then((response) => response.text())
                  .then(async (text) => {
                    if (module === 'startup' && type === 'js') {
                      text = hackStartUpModule(text);
                    } else if (module === 'mediawiki' && type === 'js') {
                      text = hackMediaWikiModule(text);
                    }

                    try {
                      const articleId = type === 'js'
                        ? jsPath(module)
                        : cssPath(module);
                      const article = new ZimArticle(articleId, text, 'A');
                      await zimCreator.addArticle(article);
                      logger.info(`created dep ${module} for article ${articleId}`);
                    } catch (e) {
                      logger.warn(`Error writing file ${moduleUri} ${e}`);
                    }
                  })
                  .catch((e) => logger.warn(`Error fetching load.php for ${articleId} ${e}`));
              } else {
                return Promise.resolve();
              }
            })
            .catch((e) => {
              logger.error(`Failed to get module with url [${moduleApiUrl}]\nYou may need to specify a custom --mwModulePath`, e);
            });
        }
      }

      function treatMedias(parsoidDoc, articleId, finished) {
        /* Clean/rewrite image tags */
        const imgs = parsoidDoc.getElementsByTagName('img');
        const videos = Array.from(parsoidDoc.getElementsByTagName('video'));
        const srcCache = {};

        videos.forEach((videoEl: DominoElement) => {
          // Worth noting:
          // Video tags are used for audio files too (as opposed to the audio tag)
          // When it's only audio, there will be a single OGG file
          // For video, we get multiple SOURCE tages with different resolutions

          const posterUrl = videoEl.getAttribute('poster');
          const videoPosterUrl = U.getFullUrl(webUrlHost, posterUrl);
          const newVideoPosterUrl = getMediaUrl(videoPosterUrl);
          let videoSources: any[] = Array.from(videoEl.children).filter((child: any) => child.tagName === 'SOURCE');

          // Firefox is not able to display correctly <video> nodes with a height < 40.
          // In that case the controls are not displayed.
          if (videoEl.getAttribute('height') && videoEl.getAttribute('height') < 40) {
            videoEl.setAttribute('height', '40');
          }

          // Always show controls
          videoEl.setAttribute('controls', '40');

          if (env.nopic || env.novid || env.nodet) {
            DU.deleteNode(videoEl);
            return;
          }

          if (posterUrl) { videoEl.setAttribute('poster', newVideoPosterUrl); }
          videoEl.removeAttribute('resource');

          if (!srcCache.hasOwnProperty(videoPosterUrl)) {
            srcCache[videoPosterUrl] = true;
            downloadFileQueue.push({ url: videoPosterUrl, zimCreator });
          }

          function byWidthXHeight(a, b) {
            // If there is no width/height, it counts as zero, probably best?
            // Sometimes (pure audio) there will only be one item
            // Sometimes (pure audio) there won't be width/height
            const aWidth = Number(a.getAttribute('data-file-width') || a.getAttribute('data-width') || 0);
            const aHeight = Number(a.getAttribute('data-file-height') || a.getAttribute('data-height') || 0);
            const bWidth = Number(b.getAttribute('data-file-width') || b.getAttribute('data-width') || 0);
            const bHeight = Number(b.getAttribute('data-file-height') || b.getAttribute('data-height') || 0);

            const aVal = aWidth * aHeight;
            const bVal = bWidth * bHeight;
            return aVal > bVal ? 1 : -1;
          }

          videoSources = videoSources.sort(byWidthXHeight);

          const sourcesToRemove = videoSources.slice(1); // All but first

          sourcesToRemove.forEach(DU.deleteNode);

          const sourceEl = videoSources[0]; // Use first source (smallest resolution)
          const sourceUrl = U.getFullUrl(webUrlHost, sourceEl.getAttribute('src'));
          const newUrl = getMediaUrl(sourceUrl);

          if (!newUrl) {
            DU.deleteNode(sourceEl);
            return;
          }

          /* Download content, but avoid duplicate calls */
          if (!srcCache.hasOwnProperty(sourceUrl)) {
            srcCache[sourceUrl] = true;
            downloadFileQueue.push({ url: sourceUrl, zimCreator });
          }

          sourceEl.setAttribute('src', newUrl);
        });

        // tslint:disable-next-line:prefer-for-of
        for (let i = 0; i < imgs.length; i += 1) {
          const img = imgs[i];
          const imageNodeClass = img.getAttribute('class') || '';

          if (
            (!env.nopic
              || imageNodeClass.search('mwe-math-fallback-image-inline') >= 0
              || img.getAttribute('typeof') === 'mw:Extension/math')
            && img.getAttribute('src')
            && img.getAttribute('src').indexOf('./Special:FilePath/') !== 0
          ) {
            /* Remove image link */
            const linkNode = img.parentNode;
            if (linkNode.tagName === 'A') {
              /* Check if the target is mirrored */
              const href = linkNode.getAttribute('href') || '';
              const title = mw.extractPageTitleFromHref(href);
              const keepLink = title && isMirrored(title);

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
                }
              }
            }

            /* Rewrite image src attribute */
            if (img) {
              const src = U.getFullUrl(webUrlHost, img.getAttribute('src'));
              const newSrc = getMediaUrl(src);

              if (newSrc) {
                /* Download image, but avoid duplicate calls */
                if (!srcCache.hasOwnProperty(src)) {
                  srcCache[src] = true;
                  downloadFileQueue.push({ url: src, zimCreator });
                }

                /* Change image source attribute to point to the local image */
                img.setAttribute('src', newSrc);

                /* Remove useless 'resource' attribute */
                img.removeAttribute('resource');

                /* Remove srcset */
                img.removeAttribute('srcset');
              } else {
                DU.deleteNode(img);
              }
            }
          } else {
            DU.deleteNode(img);
          }
        }

        /* Improve image frames */
        const figures = parsoidDoc.getElementsByTagName('figure');
        const spans = parsoidDoc.querySelectorAll('span[typeof=mw:Image/Frameless]');
        const imageNodes = Array.prototype.slice.call(figures).concat(Array.prototype.slice.call(spans));
        // tslint:disable-next-line:prefer-for-of
        for (let i = 0; i < imageNodes.length; i += 1) {
          const imageNode = imageNodes[i];
          let image;
          const numImages = imageNode.getElementsByTagName('img').length;
          const numVideos = imageNode.getElementsByTagName('video').length;
          if (numImages) {
            image = imageNode.getElementsByTagName('img')[0];
          } else if (numVideos) {
            image = imageNode.getElementsByTagName('video')[0];
          }
          const isStillLinked = image && image.parentNode && image.parentNode.tagName === 'A';

          if (!env.nopic && imageNode && image) {
            const imageNodeClass = imageNode.getAttribute('class') || ''; // imageNodeClass already defined
            const imageNodeTypeof = imageNode.getAttribute('typeof') || '';

            const descriptions = imageNode.getElementsByTagName('figcaption');
            const description = descriptions.length > 0 ? descriptions[0] : undefined;
            const imageWidth = parseInt(image.getAttribute('width'), 10);

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
              const revAutoAlign = env.ltr ? 'right' : 'left';
              DU.appendToAttr(thumbDiv, 'class', `t${revAutoAlign}`);
            }

            const thumbinnerDiv = parsoidDoc.createElement('div');
            thumbinnerDiv.setAttribute('class', 'thumbinner');
            thumbinnerDiv.setAttribute('style', `width:${imageWidth + 2}px`);

            const thumbcaptionDiv = parsoidDoc.createElement('div');
            thumbcaptionDiv.setAttribute('class', 'thumbcaption');
            const autoAlign = env.ltr ? 'left' : 'right';
            thumbcaptionDiv.setAttribute('style', `text-align: ${autoAlign}`);
            if (description) {
              thumbcaptionDiv.innerHTML = description.innerHTML;
            }

            thumbinnerDiv.appendChild(isStillLinked ? image.parentNode : image);
            thumbinnerDiv.appendChild(thumbcaptionDiv);
            thumbDiv.appendChild(thumbinnerDiv);

            imageNode.parentNode.replaceChild(thumbDiv, imageNode);
          } else {
            DU.deleteNode(imageNode);
          }
        }

        finished(null, parsoidDoc, articleId);
      }

      function rewriteUrls(parsoidDoc, articleId, finished) {
        /* Go through all links */
        const as = parsoidDoc.getElementsByTagName('a');
        const areas = parsoidDoc.getElementsByTagName('area');
        const linkNodes = Array.prototype.slice.call(as).concat(Array.prototype.slice.call(areas));

        function removeLinksToUnmirroredArticles(linkNode, href, cb) {
          const title = mw.extractPageTitleFromHref(href);
          if (!title) {
            setImmediate(() => cb());
            return;
          }

          if (isMirrored(title)) {
            /* Deal with local anchor */
            const localAnchor = href.lastIndexOf('#') === -1 ? '' : href.substr(href.lastIndexOf('#'));
            linkNode.setAttribute('href', env.getArticleUrl(title) + localAnchor);
            setImmediate(() => cb());
          } else {
            redis.processRedirectIfExists(title, (res) => {
              if (res) {
                linkNode.setAttribute('href', env.getArticleUrl(title));
              } else {
                U.migrateChildren(linkNode, linkNode.parentNode, linkNode);
                linkNode.parentNode.removeChild(linkNode);
              }
              setImmediate(() => cb());
            });
          }
        }

        function rewriteUrl(linkNode, finished) {
          const rel = linkNode.getAttribute('rel');
          let href = linkNode.getAttribute('href') || '';

          if (!href) {
            DU.deleteNode(linkNode);
            setImmediate(() => finished());
          } else if (href.substring(0, 1) === '#') {
            setImmediate(() => finished());
          } else {
            /* Deal with custom geo. URL replacement, for example:
             * http://maps.wikivoyage-ev.org/w/poimap2.php?lat=44.5044943&lon=34.1969633&zoom=15&layer=M&lang=ru&name=%D0%9C%D0%B0%D1%81%D1%81%D0%B0%D0%BD%D0%B4%D1%80%D0%B0
             * http://tools.wmflabs.org/geohack/geohack.php?language=fr&pagename=Tour_Eiffel&params=48.85825_N_2.2945_E_type:landmark_region:fr
             */
            if (rel !== 'mw:WikiLink') {
              let lat;
              let lon;
              if (/poimap2\.php/i.test(href)) {
                const hrefQuery = urlParser.parse(href, true).query;
                lat = parseFloat(hrefQuery.lat as string);
                lon = parseFloat(hrefQuery.lon as string);
              } else if (/geohack\.php/i.test(href)) {
                let { params } = urlParser.parse(href, true).query;

                /* "params" might be an array, try to detect the geo localization one */
                if (params instanceof Array) {
                  let i = 0;
                  while (params[i] && isNaN(+params[i][0])) {
                    i += 1;
                  }
                  params = params[i];
                }

                if (params) {
                  // see https://bitbucket.org/magnusmanske/geohack/src public_html geo_param.php
                  const pieces = params.toUpperCase().split('_');
                  const semiPieces = pieces.length > 0 ? pieces[0].split(';') : undefined;
                  if (semiPieces && semiPieces.length === 2) {
                    [lat, lon] = semiPieces;
                  } else {
                    const factors = [1, 60, 3600];
                    let offs = 0;

                    const deg = (hemiHash) => {
                      let out = 0;
                      let hemiSign = 0;
                      for (let i = 0; i < 4 && i + offs < pieces.length; i += 1) {
                        const v = pieces[i + offs];
                        hemiSign = hemiHash[v];
                        if (hemiSign) {
                          offs = i + 1;
                          break;
                        }
                        out += +v / factors[i];
                      }
                      return out * hemiSign;
                    };

                    lat = deg({ N: 1, S: -1 });
                    lon = deg({ E: 1, W: -1, O: 1 });
                  }
                }
              } else if (/Special:Map/i.test(href)) {
                const parts = href.split('/');
                lat = parts[4];
                lon = parts[5];
              } else if (rel === 'mw:MediaLink') {
                if (!env.nopdf && /\.pdf/i.test(href)) {
                  try {
                    linkNode.setAttribute('href', getMediaUrl(href));
                    downloadFileQueue.push({ url: href, zimCreator });
                  } catch (err) {
                    logger.warn('Error parsing url:', err);
                    DU.deleteNode(linkNode);
                  }
                }
              }

              if (!isNaN(lat) && !isNaN(lon)) {
                href = `geo:${lat},${lon}`;
                linkNode.setAttribute('href', href);
              }
            }

            if (rel) { // This is Parsoid HTML
              /* Add 'external' class to interwiki links */
              if (rel === 'mw:WikiLink/Interwiki') {
                DU.appendToAttr(linkNode, 'class', 'external');
              }

              /* Check if the link is "valid" */
              if (!href) {
                return finished({ message: `No href attribute in the following code, in article ${articleId}\n${linkNode.outerHTML}` });
              }

              /* Rewrite external links starting with // */
              if (rel.substring(0, 10) === 'mw:ExtLink' || rel === 'nofollow') {
                if (href.substring(0, 1) === '/') {
                  linkNode.setAttribute('href', U.getFullUrl(webUrlHost, href));
                } else if (href.substring(0, 2) === './') {
                  U.migrateChildren(linkNode, linkNode.parentNode, linkNode);
                  linkNode.parentNode.removeChild(linkNode);
                }
                setImmediate(() => finished());
              } else if (rel === 'mw:WikiLink' || rel === 'mw:referencedBy') {
                removeLinksToUnmirroredArticles(linkNode, href, finished);
              } else {
                setImmediate(() => finished());
              }
            } else { // This is MediaWiki HTML
              removeLinksToUnmirroredArticles(linkNode, href, finished);
            }
          }
        }

        async.eachLimit(linkNodes, speed, rewriteUrl, (error) => {
          finished(error && { message: `Problem rewriting urls`, error }, parsoidDoc, articleId);
        });
      }

      function applyOtherTreatments(parsoidDoc, articleId, finished) {
        const filtersConfig = config.filters;

        /* Don't need <link> and <input> tags */
        const nodesToDelete: Array<{ class?: string, tag?: string, filter?: (n) => boolean }> = [{ tag: 'link' }, { tag: 'input' }];

        /* Remove "map" tags if necessary */
        if (env.nopic) {
          nodesToDelete.push({ tag: 'map' });
        }

        /* Remove useless DOM nodes without children */
        function emptyChildFilter(n) {
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
        filtersConfig.cssClassBlackList.forEach((classname) => {
          nodesToDelete.push({ class: classname });
        });

        if (env.nodet) {
          filtersConfig.nodetCssClassBlackList.forEach((classname) => {
            nodesToDelete.push({ class: classname });
          });
        }

        /* Remove element with black listed CSS classes and no link */
        filtersConfig.cssClassBlackListIfNoLink.forEach((classname) => {
          nodesToDelete.push({
            class: classname,
            filter(n) {
              return n.getElementsByTagName('a').length === 0;
            },
          });
        });

        /* Delete them all */
        nodesToDelete.forEach((t) => {
          let nodes;
          if (t.tag) {
            nodes = parsoidDoc.getElementsByTagName(t.tag);
          } else if (t.class) {
            nodes = parsoidDoc.getElementsByClassName(t.class);
          } else {
            return; /* throw error? */
          }

          const f = t.filter;
          // tslint:disable-next-line:prefer-for-of
          for (let i = 0; i < nodes.length; i += 1) {
            if (!f || f(nodes[i])) {
              DU.deleteNode(nodes[i]);
            }
          }
        });

        /* Go through all reference calls */
        const spans = parsoidDoc.getElementsByTagName('span');
        // tslint:disable-next-line:prefer-for-of
        for (let i = 0; i < spans.length; i += 1) {
          const span = spans[i];
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
        filtersConfig.cssClassDisplayList.map((classname) => {
          const nodes = parsoidDoc.getElementsByClassName(classname);
          // tslint:disable-next-line:prefer-for-of
          for (let i = 0; i < nodes.length; i += 1) {
            nodes[i].style.removeProperty('display');
          }
        });

        /* Remove empty paragraphs */
        if (!keepEmptyParagraphs) {
          for (let level = 5; level > 0; level--) {
            const paragraphNodes = parsoidDoc.getElementsByTagName(`h${level}`);
            // tslint:disable-next-line:prefer-for-of
            for (let i = 0; i < paragraphNodes.length; i += 1) {
              const paragraphNode = paragraphNodes[i];
              const nextElementNode = DU.nextElementSibling(paragraphNode);

              /* No nodes */
              if (!nextElementNode) {
                DU.deleteNode(paragraphNode);
              } else {
                /* Delete if nextElementNode is a paragraph with <= level */
                const nextElementNodeTag = nextElementNode.tagName.toLowerCase();
                if (
                  nextElementNodeTag.length > 1
                  && nextElementNodeTag[0] === 'h'
                  && !isNaN(nextElementNodeTag[1])
                  && nextElementNodeTag[1] <= level
                ) {
                  DU.deleteNode(paragraphNode);
                }
              }
            }
          }
        }

        /* Clean the DOM of all uncessary code */
        const allNodes = parsoidDoc.getElementsByTagName('*');
        // tslint:disable-next-line:prefer-for-of
        for (let i = 0; i < allNodes.length; i += 1) {
          const node = allNodes[i];
          node.removeAttribute('data-parsoid');
          node.removeAttribute('typeof');
          node.removeAttribute('about');
          node.removeAttribute('data-mw');

          if (node.getAttribute('rel') && node.getAttribute('rel').substr(0, 3) === 'mw:') {
            node.removeAttribute('rel');
          }

          /* Remove a few css calls */
          filtersConfig.cssClassCallsBlackList.map((classname) => {
            if (node.getAttribute('class')) {
              node.setAttribute('class', node.getAttribute('class').replace(classname, ''));
            }
          });
        }

        finished(null, parsoidDoc, articleId);
      }

      function setFooter(parsoidDoc, articleId, finished) {
        const htmlTemplateDoc = domino.createDocument(
          htmlTemplateCode
            .replace('__ARTICLE_CONFIGVARS_LIST__', jsConfigVars !== '' ? genHeaderScript('jsConfigVars') : '')
            .replace(
              '__ARTICLE_JS_LIST__',
              jsDependenciesList.length !== 0
                ? jsDependenciesList.map((oneJsDep) => genHeaderScript(oneJsDep)).join('\n')
                : '',
            )
            .replace(
              '__ARTICLE_CSS_LIST__',
              styleDependenciesList.length !== 0
                ? styleDependenciesList.map((oneCssDep) => genHeaderCSSLink(oneCssDep)).join('\n')
                : '',
            ),
        );

        /* Create final document by merging template and parsoid documents */
        htmlTemplateDoc.getElementById('mw-content-text').style.setProperty('direction', env.ltr ? 'ltr' : 'rtl');
        htmlTemplateDoc.getElementById('mw-content-text').innerHTML = parsoidDoc.getElementsByTagName('body')[
          0
        ].innerHTML;

        /* Title */
        htmlTemplateDoc.getElementsByTagName('title')[0].innerHTML = htmlTemplateDoc.getElementById('title_0')
          ? htmlTemplateDoc.getElementById('title_0').textContent
          : articleId.replace(/_/g, ' ');
        DU.deleteNode(htmlTemplateDoc.getElementById('titleHeading'));

        /* Subpage */
        if (isSubpage(articleId) && mainPage !== articleId) {
          const headingNode = htmlTemplateDoc.getElementById('mw-content-text');
          const subpagesNode = htmlTemplateDoc.createElement('span');
          const parents = articleId.split('/');
          parents.pop();
          let subpages = '';
          let parentPath = '';
          parents.map((parent) => {
            const label = parent.replace(/_/g, ' ');
            const isParentMirrored = isMirrored(parentPath + parent);
            subpages
              += `&lt; ${
              isParentMirrored
                ? `<a href="${env.getArticleUrl(parentPath + parent)}" title="${label}">`
                : ''
              }${label
              }${isParentMirrored ? '</a> ' : ' '}`;
            parentPath += `${parent}/`;
          });
          subpagesNode.innerHTML = subpages;
          subpagesNode.setAttribute('class', 'subpages');
          headingNode.parentNode.insertBefore(subpagesNode, headingNode);
        }

        /* Set footer */
        const div = htmlTemplateDoc.createElement('div');
        const { oldId } = articleDetailXId[articleId];
        redis.getArticle(articleId, (error, detailsJson) => {
          if (error) {
            finished({ message: `Unable to get the details from redis for article ${articleId}`, error });
          } else {
            /* Is seems that sporadically this goes wrong */
            const details = JSON.parse(detailsJson);

            /* Revision date */
            const timestamp = details.t;
            const date = new Date(timestamp * 1000);
            div.innerHTML = footerTemplate({
              articleId: encodeURIComponent(articleId),
              webUrl: mw.webUrl,
              creator: creator,
              oldId,
              date: date.toISOString().substring(0, 10),
              strings,
            });
            htmlTemplateDoc.getElementById('mw-content-text').appendChild(div);
            addNoIndexCommentToElement(div);

            /* Geo-coordinates */
            const geoCoordinates = details.g;
            if (geoCoordinates) {
              const metaNode = htmlTemplateDoc.createElement('meta');
              metaNode.name = 'geo.position';
              metaNode.content = geoCoordinates; // latitude + ';' + longitude;
              htmlTemplateDoc.getElementsByTagName('head')[0].appendChild(metaNode);
            }

            finished(null, htmlTemplateDoc, articleId);
          }
        });
      }

      function writeArticle(doc, articleId, finished) {
        logger.log(`Saving article ${articleId}...`);
        let html = doc.documentElement.outerHTML;

        if (minifyHtml) {
          html = htmlMinifier.minify(html, {
            removeComments: true,
            conservativeCollapse: true,
            collapseBooleanAttributes: true,
            removeRedundantAttributes: true,
            removeEmptyAttributes: true,
            minifyCSS: true,
          });
        }

        if (env.deflateTmpHtml) {
          zlib.deflate(html, (error, deflatedHtml) => {
            // fs.writeFile(env.getArticlePath(articleId), deflatedHtml, finished);
            const article = new ZimArticle(articleId + '.html', deflatedHtml, 'A', 'text/html');
            zimCreator.addArticle(article).then(finished, finished);
          });
        } else {
          // fs.writeFile(env.getArticlePath(articleId), html, finished);
          const article = new ZimArticle(articleId + '.html', html, 'A', 'text/html');
          zimCreator.addArticle(article).then(finished, finished);
        }
      }

      function saveArticle(articleId, finished) {
        const useParsoidFallback = articleId === mainPage;
        downloader.getArticle(articleId, useParsoidFallback)
          .then((html) => {
            if (html) {
              const articlePath = env.getArticlePath(articleId);
              const prepareAndSaveArticle = async.compose(
                writeArticle,
                setFooter,
                applyOtherTreatments,
                rewriteUrls,
                treatMedias,
                storeDependencies,
                parseHtml,
              );

              logger.info(`Treating and saving article ${articleId} at ${articlePath}...`);
              prepareAndSaveArticle(html, articleId, (error) => {
                if (!error) {
                  logger.info(`Successfully dumped article ${articleId}`);
                  finished();
                } else {
                  logger.warn(`Error preparing and saving file, skipping [${articleId}]`, error);
                  finished(error);
                }
              });
            } else {
              throw new Error(`No HTML was found`);
            }
          })
          .catch((e) => {
            logger.error(`Error handling json response from api. ${e}`);
            delete articleDetailXId[articleId];
            finished();
          });
      }

      logger.log('Saving articles...');
      async.eachLimit(Object.keys(articleDetailXId), speed, saveArticle, (error) => {
        if (error) {
          reject({ message: `Fatal Error:`, error });
        } else {
          logger.log('All articles were retrieved and saved.');
          resolve();
        }
      });
    });
  }

  function addNoIndexCommentToElement(element) {
    const slices = element.parentElement.innerHTML.split(element.outerHTML);
    element.parentElement.innerHTML = `${slices[0]}<!--htdig_noindex-->${element.outerHTML}<!--/htdig_noindex-->${slices[1]}`;
  }

  function isMirrored(id) {
    if (!articleList && id && id.indexOf(':') >= 0) {
      const namespace = mw.namespaces[id.substring(0, id.indexOf(':')).replace(/ /g, mw.spaceDelimiter)];
      if (namespace !== undefined) {
        return namespace.isContent;
      }
    }
    return id in articleDetailXId;
  }

  function isSubpage(id) {
    if (id && id.indexOf('/') >= 0) {
      let namespace = id.indexOf(':') >= 0 ? id.substring(0, id.indexOf(':')).replace(/ /g, mw.spaceDelimiter) : '';
      namespace = mw.namespaces[namespace]; // namespace already defined
      if (namespace !== undefined) {
        return namespace.allowedSubpages;
      }
    }
    return false;
  }

  /* Grab and concatenate stylesheet files */
  function saveStylesheet(zimCreator: ZimCreator) {
    return new Promise((resolve, reject) => {
      logger.log('Dumping stylesheets...');
      const urlCache = {};
      const stylePath = `${env.htmlRootPath}${dirs.style}/style.css`;

      /* Remove if exists */
      fs.unlink(stylePath, () => null);


    });
  }

  function getArticleIds(redirectQueue) {
    function drainRedirectQueue(redirectQueue) {
      return new Promise((resolve, reject) => {
        redirectQueue.drain = function drain(error) {
          if (error) {
            reject(`Unable to retrieve redirects for an article: ${error}`);
          } else {
            logger.log('All redirect ids retrieve successfuly.');
            resolve();
          }
        } as any;
        redirectQueue.push('');
      });
    }

    /* Parse article list given by API */
    function parseAPIResponse(body) {
      let next = '';
      const json = JSON.parse(body);
      const entries = json.query && json.query.pages;

      if (entries) {
        const redirectQueueValues = [];
        const details = {};
        Object.keys(entries).map((key) => {
          const entry = entries[key];
          entry.title = entry.title.replace(/ /g, mw.spaceDelimiter);

          if ('missing' in entry) {
            logger.warn(`Article ${entry.title} is not available on this wiki.`);
            delete articleDetailXId[entry.title];
          } else {
            redirectQueueValues.push(entry.title);

            if (entry.revisions) {
              /* Get last revision id */
              articleDetailXId[entry.title] = Object.assign(articleDetailXId[entry.title] || {}, {
                title: entry.title,
                oldId: entry.revisions[0].revid,
              });

              /* Get last revision id timestamp */
              const articleDetails: { t: number, g?: string } = { t: new Date(entry.revisions[0].timestamp).getTime() / 1000 };

              /* Get article geo coordinates */
              if (entry.coordinates) {
                articleDetails.g = `${entry.coordinates[0].lat};${entry.coordinates[0].lon}`;
              }

              /* Save as JSON string */
              details[entry.title] = JSON.stringify(articleDetails);
            } else if (entry.pageid) {
              logger.warn(`Unable to get revisions for ${entry.title}, but entry exists in the database. Article was probably deleted meanwhile.`);
              delete articleDetailXId[entry.title];
            } else {
              throw new Error(`Unable to get revisions for ${entry.title}\nJSON was ${body}`);
            }
          }
        });
        if (redirectQueueValues.length) { redirectQueue.push(redirectQueueValues); }
        redis.saveArticles(details);
      }

      /* Get continue parameters from 'query-continue',
       * unfortunately old MW version does not use the same way
       * than recent */
      const continueHash = json['query-continue'] && json['query-continue'].allpages;
      if (continueHash) {
        Object.keys(continueHash).forEach((key) => {
          next += `&${key}=${encodeURIComponent(continueHash[key])}`;
        });
      }

      return next;
    }

    function getArticleIdsForLine(redirectQueue, line) {
      return new Promise((resolve, reject) => {
        if (line) {
          const title = line.replace(/ /g, mw.spaceDelimiter).replace('\r', '');
          const f = () => {
            downloader.downloadContent.bind(downloader)(mw.articleQueryUrl(title))
              .then(({ content }) => {
                const body = content.toString();
                if (body && body.length > 1) {
                  parseAPIResponse(body);
                }
                setTimeout(resolve, redirectQueue.length());
              })
              .catch(reject);
          };
          setTimeout(
            f,
            redirectQueue.length() > 30000 ? redirectQueue.length() - 30000 : 0,
          );
        } else {
          resolve();
        }
      });
    }

    /* Get ids from file */
    function getArticleIdsForFile() {
      let lines;
      try {
        lines = fs.readFileSync(articleList).toString().split('\n');
      } catch (error) {
        return Promise.reject(`Unable to open article list file: ${error}`);
      }

      return new Promise((resolve, reject) => {
        async.eachLimit(
          lines,
          speed,
          (line, finish) => getArticleIdsForLine(redirectQueue, line).then(() => finish(), (err) => finish(err)),
          (error) => {
            if (error) {
              reject({ message: `Unable to get all article ids for a file`, error });
            } else {
              logger.log('List of article ids to mirror completed');
              drainRedirectQueue(redirectQueue).then(resolve, reject);
            }
          });
      });
    }

    /* Get ids from Mediawiki API */
    function getArticleIdsForNamespace(namespace, finished) {
      let next = '';

      async.doWhilst(
        (finished) => {
          logger.log(
            `Getting article ids for namespace "${namespace}" ${next !== '' ? ` (from ${namespace ? `${namespace}:` : ''}${next.split('=')[1]})` : ''
            }...`,
          );
          const url = mw.pageGeneratorQueryUrl(namespace, next);
          const dc = downloader.downloadContent.bind(downloader);
          setTimeout((url, handler) => {
            dc(url)
              .then(({ content }) => handler(content))
              .catch((err) => finished(err));
          },
            redirectQueue.length() > 30000 ? redirectQueue.length() - 30000 : 0,
            url,
            (content) => {
              const body = content.toString();
              if (body && body.length > 1) {
                next = parseAPIResponse(body);
                finished();
              } else {
                next = '';
                finished({ message: `Error by retrieving ${url}` } as any);
              }
            });
        },
        () => next as any,
        (error) => {
          if (!error) {
            logger.log(`List of article ids to mirror completed for namespace "${namespace}"`);
          }
          finished(error && { message: `Unable to download article ids`, error });
        },
      );
    }

    function getArticleIdsForNamespaces() {
      return new Promise((resolve, reject) => {
        async.eachLimit(mw.namespacesToMirror, mw.namespacesToMirror.length, getArticleIdsForNamespace, (error) => {
          if (error) {
            reject(`Unable to get all article ids for in a namespace: ${error}`);
          } else {
            logger.log('All articles ids (but without redirect ids) for all namespaces were successfuly retrieved.');
            drainRedirectQueue(redirectQueue).then(resolve, reject);
          }
        });
      });
    }

    /* Get list of article ids */
    return doSeries([
      () => getArticleIdsForLine(redirectQueue, mainPage),
      () => {
        if (articleList) {
          return getArticleIdsForFile();
        } else {
          return getArticleIdsForNamespaces();
        }
      },
      () => {
        if (!articleList && !isMirrored(mainPage)) {
          return getArticleIdsForLine(redirectQueue, mainPage);
        } else {
          return Promise.resolve();
        }
      },
    ]);
  }

  /* Multiple developer friendly functions */
  function downloadContentAndCache(url): Promise<{ content: any, responseHeaders: any }> {
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
            U.touch(cachePath);
            resolve({ content: results[0], responseHeaders: results[1] });
          }
        },
      );
    });
  }

  function downloadFileAndCache(zimCreator: ZimCreator, url, callback) {
    if (!url) {
      callback();
      return;
    }

    logger.info(`Downloading and Cacheing [${url}]`);

    const parts = mediaRegex.exec(decodeURI(url));
    const filenameBase = parts[2].length > parts[5].length
      ? parts[2]
      : parts[5] + (parts[6] || '.svg') + (parts[7] || '');
    const width = parseInt(parts[4].replace(/px-/g, ''), 10) || INFINITY_WIDTH;

    /* Check if we have already met this image during this dumping process */
    redis.getMedia(filenameBase, (error, rWidth) => {
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
                    U.touch(cachePath);
                  }
                }

                if (!skipCacheCleaning) {
                  U.touch(cacheHeadersPath);
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

  /* Internal path/url functions */
  function getMediaBase(url, escape) {
    let root;

    const parts = mediaRegex.exec(decodeURI(url));
    if (parts) {
      root = parts[2].length > parts[5].length ? parts[2] : parts[5] + (parts[6] || '.svg') + (parts[7] || '');
    }

    if (!root) {
      logger.warn(`Unable to parse media url "${url}"`);
      return '';
    }

    function e(str: string) {
      if (typeof str === 'undefined') {
        return undefined;
      }
      return escape ? encodeURIComponent(str) : str;
    }

    const filenameFirstVariant = parts[2];
    const filenameSecondVariant = parts[5] + (parts[6] || '.svg') + (parts[7] || '');
    let filename = U.decodeURIComponent(
      filenameFirstVariant.length > filenameSecondVariant.length ? filenameFirstVariant : filenameSecondVariant,
    );

    /* Need to shorten the file due to filesystem limitations */
    if (unicodeCutter.getBinarySize(filename) > 249) {
      const ext = pathParser.extname(filename).split('.')[1] || '';
      const basename = filename.substring(0, filename.length - ext.length - 1) || '';
      filename = `${unicodeCutter.truncateToBinarySize(basename, 239 - ext.length)
        + crypto.createHash('md5').update(basename).digest('hex').substring(0, 2)}.${ext}`;
    }

    return `${dirs.media}/${e(filename)}`;
  }

  function getMediaUrl(url) {
    return getMediaBase(url, true);
  }

  function getMediaPath(url, escape?) {
    const mediaBase = getMediaBase(url, escape);
    return mediaBase ? env.htmlRootPath + mediaBase : undefined;
  }

  async function saveFavicon(zimCreator) {
    logger.log('Saving favicon.png...');

    function resizeFavicon(zimCreator: ZimCreator, faviconPath) {
      return new Promise((resolve, reject) => {
        const cmd = `convert -thumbnail 48 "${faviconPath}" "${faviconPath}.tmp" ; mv "${faviconPath}.tmp" "${faviconPath}" `;
        exec(cmd, (error) => {
          if (error) {
            reject();
          } else {
            U.readFilePromise(faviconPath).then((faviconContent) => {
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
          const faviconPath = env.htmlRootPath + `favicon.${ext}`;
          const faviconFinalPath = env.htmlRootPath + `favicon.png`;
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

  function getMainPage(zimCreator: ZimCreator) {
    function writeMainPage(html) {
      // const mainPagePath = `${env.htmlRootPath}index.htm`;
      if (env.deflateTmpHtml) {
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
            genHeaderCSSLink('mobile_main_page') + '\n' +
            genHeaderCSSLink('style') + '\n' +
            genHeaderScript('images_loaded.min') + '\n' +
            genHeaderScript('masonry.min') + '\n' +
            genHeaderScript('article_list_home') + '\n' +
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

      const minImageThreshold = 10;
      if (articlesWithImages.length > minImageThreshold) {
        const articlesWithImagesEl = articlesWithImages.map((article) => U.makeArticleImageTile(env, article)).join('\n');
        doc.getElementById('content').innerHTML = articlesWithImagesEl;
      } else {
        const articlesWithoutImagesEl = allArticles.map((article) => U.makeArticleListItem(env, article)).join('\n');
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
        target: env.getArticleBase(mainPage, true),
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
