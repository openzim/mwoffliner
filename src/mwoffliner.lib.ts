/* ********************************** */
/* MODULE VARIABLE SECTION ********** */
/* ********************************** */

import async from 'async';
import { exec } from 'child_process';
import crypto from 'crypto';
import domino from 'domino';
import { http, https } from 'follow-redirects';
import fs from 'fs';
import htmlMinifier from 'html-minifier';
import fetch from 'node-fetch';
import os from 'os';
import parsoid from 'parsoid';
import pathParser, { resolve } from 'path';
import swig from 'swig-templates';
import urlParser from 'url';
import unicodeCutter from 'utf8-binary-cutter';
import zlib from 'zlib';
import semver from 'semver';

import config from './config';
import DU from './DOMUtils';
import Downloader from './Downloader';
import Logger from './Logger';
import MediaWiki from './MediaWiki';
import OfflinerEnv from './OfflinerEnv';
import parameterList from './parameterList';
import Redis from './redis';
import * as U from './Utils';
import { contains, getCreatorName, checkDependencies, doSeries, writeFilePromise } from './Utils';
import Zim from './Zim';
import packageJSON from '../package.json';

const nodeVersionSatisfiesPackage = semver.satisfies(process.version, packageJSON.engines.node);
if (!nodeVersionSatisfiesPackage) {
  console.warn(`***********\n\n\tCurrent node version is [${process.version}]. We recommend [${packageJSON.engines.node}]\n\n***********`);
}

function getParametersList() {
  // Want to remove this anonymous function. Need to investigate to see if it's needed
  return parameterList;
}

async function execute(argv) {
  /* ********************************* */
  /* CUSTOM VARIABLE SECTION ********* */
  /* ********************************* */

  const {
    // tslint:disable-next-line:variable-name
    speed: _speed,
    adminEmail,
    localParsoid,
    customZimFavicon,
    verbose,
    minifyHtml,
    skipHtmlCache,
    skipCacheCleaning,
    keepEmptyParagraphs,
    mwUrl,
    mwWikiPath,
    mwApiPath,
    mwDomain,
    mwUsername,
    mwPassword,
    requestTimeout,
    publisher,
    articleList,
    customMainPage,
    customZimTitle,
    customZimDescription,
    customZimTags,
    cacheDirectory,
    mobileLayout,
    outputDirectory,
    tmpDirectory,
    withZimFullTextIndex,
    format,
    filenamePrefix,
    keepHtml,
    resume,
    deflateTmpHtml,
    writeHtmlRedirects,
    // tslint:disable-next-line:variable-name
    addNamespaces: _addNamespaces,
  } = argv;

  let {
    parsoidUrl,
  } = argv;

  /* HTTP user-agent string */
  // const adminEmail = argv.adminEmail;
  if (!U.isValidEmail(adminEmail)) { throw new Error(`Admin email [${adminEmail}] is not valid`); }

  /* ZIM custom Favicon */
  if (customZimFavicon && !fs.existsSync(customZimFavicon)) { throw new Error(`Path ${customZimFavicon} is not a valid PNG file.`); }

  /* Number of parallel requests */
  if (_speed && isNaN(_speed)) { throw new Error('speed is not a number, please give a number value to --speed'); }
  const cpuCount = os.cpus().length;
  const speed = cpuCount * (_speed || 1);

  /* Necessary to avoid problems with https */
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  /* logger */
  const logger = new Logger(verbose);

  /* Wikipedia/... URL; Normalize by adding trailing / as necessary */
  const mw = new MediaWiki(logger, {
    apiPath: mwApiPath,
    base: mwUrl,
    domain: mwDomain,
    password: mwPassword,
    spaceDelimiter: '_',
    username: mwUsername,
    wikiPath: mwWikiPath,
  });

  /* Download helpers; TODO: Merge with something else / expand this. */
  const downloader = new Downloader(
    logger,
    mw,
    `${config.userAgent} (${adminEmail})`,
    requestTimeout || config.defaults.requestTimeout,
  );

  const creator = getCreatorName(mw);

  /* *********************************** */
  /*       SYSTEM VARIABLE SECTION       */
  /* *********************************** */

  const zimOpts = {
    // Name to use for ZIM (content) creator
    creator,

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

    // Layout
    mobileLayout: mobileLayout || false,

    // File where redirects might be save if --writeHtmlRedirects is not set
    redirectsCacheFile: null,

    // Directory wehre everything is saved at the end of the process
    outputDirectory,

    // Directory where temporary data are saved
    tmpDirectory,

    // Include fulltext index in ZIM file
    withZimFullTextIndex,

    // What is this?
    subTitle: '',
  };
  const zim = new Zim(config, zimOpts);

  // Temporary stub env for now to encapsulate state and pass around
  // where it is required. This might eventually take a different form
  // after refactoring is complete.
  const env = new OfflinerEnv(format, {
    zim,
    mw,
    logger,
    downloader,
    verbose,

    // Prefix part of the filename (radical)
    filenamePrefix: filenamePrefix || '',

    // If ZIM is built, should temporary HTML directory be kept
    keepHtml,

    // Should we keep ZIM file generation if ZIM file already exists
    resume,

    deflateTmpHtml,

    // How to write redirects
    writeHtmlRedirects,
  });

  const INFINITY_WIDTH = 9999999;
  const articleIds = {};
  const webUrlHost = urlParser.parse(mw.webUrl).host;
  let parsoidContentType = 'html';
  const addNamespaces = _addNamespaces ? String(_addNamespaces).split(',') : [];

  if (!parsoidUrl) {
    if (localParsoid) {
      console.info('Starting Parsoid');
      // Icky but necessary
      fs.writeFileSync(
        './localsettings.js',
        `
                exports.setup = function(parsoidConfig) {
                    parsoidConfig.setMwApi({
                        uri: '${mw.base + mw.apiPath}',
                    });
                };
                `,
        'utf8',
      );
      await parsoid
        .apiServiceWorker({
          appBasePath: './node_modules/parsoid',
          logger: console,
          config: {
            localsettings: '../../localsettings.js',
            parent: undefined,
          },
        })
        .then((_) => {
          fs.unlinkSync('./localsettings.js');
          console.info('Parsoid Started Successfully');
        });
      parsoidUrl = `http://localhost:8000/${webUrlHost}/v3/page/pagebundle/`;
      parsoidContentType = 'json';
    } else {
      parsoidUrl = `${mw.apiUrl}action=visualeditor&format=json&paction=parse&page=`;
      parsoidContentType = 'json';
    }
  }

  /* ********************************* */
  /* RUNNING CODE ******************** */
  /* ********************************* */

  await checkDependencies(env);

  /* Setup redis client */
  const redis = new Redis(env, argv, config);

  /* Some helpers */
  function readTemplate(t) {
    return fs.readFileSync(pathParser.resolve(__dirname, '../res', t), 'utf-8');
  }
  const { dirs } = config.output;
  function cssPath(css) {
    return [dirs.style, dirs.styleModules, `${css.replace(/(\.css)?$/, '')}.css`].join('/');
  }
  function jsPath(js) {
    return [dirs.javascript, dirs.jsModules, `${js.replace(/(\.js)?$/, '')}.js`].join('/');
  }
  function genHeaderCSSLink(css) {
    return `<link href="${cssPath(css)}" rel="stylesheet" type="text/css" />`;
  }
  function genHeaderScript(js) {
    return `<script src="${jsPath(js)}"></script>`;
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
  const genericCssModules = zim.mobileLayout ? config.output.mw.css.mobile : config.output.mw.css.desktop;

  const mediaRegex = /^(.*\/)([^/]+)(\/)(\d+px-|)(.+?)(\.[A-Za-z0-9]{2,6}|)(\.[A-Za-z0-9]{2,6}|)$/;
  const htmlMobileTemplateCode = readTemplate(config.output.templates.mobile)
    .replace('__CSS_LINKS__', cssLinks)
    .replace('__JS_SCRIPTS__', jsScripts);
  const htmlDesktopTemplateCode = readTemplate(config.output.templates.desktop);

  /* ********************************* */
  /* MEDIA RELATED QUEUES ************ */
  /* ********************************* */

  /* Setting up media optimization queue */
  const optimizationQueue = async.queue((file: any, finished) => {
    const { path } = file;

    function getOptimizationCommand(path, forcedType?) {
      const ext = pathParser.extname(path).split('.')[1] || '';
      const basename = path.substring(0, path.length - ext.length - 1) || '';
      const tmpExt = `.${U.randomString(5)}.${ext}`;
      let tmpPath = basename + tmpExt;
      const type = forcedType || ext;

      /* Escape paths */
      path = path.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
      tmpPath = tmpPath.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');

      if (type === 'jpg' || type === 'jpeg' || type === 'JPG' || type === 'JPEG') {
        return `jpegoptim --strip-all --force --all-normal -m60 "${path}"`;
      }
      if (type === 'png' || type === 'PNG') {
        return (
          `pngquant --verbose --strip --nofs --force --ext="${tmpExt}" "${path}" &&\
          advdef -q -z -4 -i 5 "${tmpPath}" &&\
          if [ $(stat -c%s "${tmpPath}") -lt $(stat -c%s "${path}") ]; then mv "${tmpPath}" "${path}"; else rm "${tmpPath}"; fi`
        );
      }
      if (type === 'gif' || type === 'GIF') {
        return (
          `gifsicle --verbose --colors 64 -O3 "${path}" -o "${tmpPath}" &&\
          if [ $(stat -c%s "${tmpPath}") -lt $(stat -c%s "${path}") ]; then mv "${tmpPath}" "${path}"; else rm "${tmpPath}"; fi`
        );
      }
    }

    if (!path || !file.size) {
      finished();
      return;
    }

    fs.stat(path, (preOptimError, preOptimStats) => {
      if (preOptimError || preOptimStats.size !== file.size) {
        if (preOptimError) {
          console.error(`Failed to start to optim ${path}. Size should be ${file.size} - file was probably deleted:`, preOptimError);
        } else {
          console.error(`Failed to start to optim ${path}. Size should be ${file.size} - file was probably deleted:`, preOptimStats ? preOptimStats.size : 'No stats information');
        }
        finished();
        return;
      }

      let cmd = getOptimizationCommand(path);
      if (!cmd) {
        finished();
        return;
      }

      async.retry(
        5,
        (finished) => {
          console.info(`Executing command : ${cmd}`);
          if (!cmd) {
            finished(null, 'No optim command, skipping file');
            return;
          }
          exec(cmd, (executionError) => {
            if (!executionError) {
              finished();
              return;
            }

            fs.stat(path, (postOptimError, postOptimStats) => {
              if (!postOptimError && postOptimStats.size > file.size) {
                finished(null, true);
              } else if (!postOptimError && postOptimStats.size < file.size) {
                finished('File to optim is smaller (before optim) than it should.');
              } else {
                exec(`file -b --mime-type "${path}"`, (error, stdout) => {
                  const type = stdout.replace(/image\//, '').replace(/[\n\r]/g, '');
                  cmd = getOptimizationCommand(path, type);
                  if (cmd) {
                    setTimeout(finished, 2000, executionError);
                  } else {
                    finished('Unable to find optimization command.');
                  }
                });
              }
            });
          });
        },
        (error, skip) => {
          if (error) {
            console.error(`Failed to optim ${path}, with size=${file.size} (${error})`);
          } else if (skip) {
            logger.log(`Optimization skipped for ${path}, with size='${file.size}, a better version was downloaded meanwhile.`);
          } else {
            logger.log(`Successfuly optimized ${path}`);
          }
          finished();
        },
      );
    });
  }, cpuCount * 2);

  /* Setting up the downloading queue */
  const downloadFileQueue = async.queue((url, finished) => {
    downloadFileAndCache(url, finished);
  }, speed * 5);

  /* Get ids */
  const redirectQueue = async.queue((articleId, finished) => {
    if (articleId) {
      logger.log(`Getting redirects for article ${articleId}...`);
      const url = mw.backlinkRedirectsQueryUrl(articleId);
      downloader.downloadContent(url, (content) => {
        const body = content.toString();
        try {
          if (!JSON.parse(body).error) {
            const redirects = {};
            let redirectsCount = 0;
            const { pages } = JSON.parse(body).query;

            pages[Object.keys(pages)[0]].redirects.map((entry) => {
              const title = entry.title.replace(/ /g, mw.spaceDelimiter);
              redirects[title] = articleId;
              redirectsCount += 1;

              if (title === zim.mainPageId) {
                zim.mainPageId = articleId;
              }
            });
            logger.log(`${redirectsCount} redirect(s) found for ${articleId}`);
            redis.saveRedirects(redirectsCount, redirects, finished);
          } else {
            finished(JSON.parse(body).error);
          }
        } catch (error) {
          finished(error);
        }
      });
    } else {
      finished();
    }
  }, speed * 3);

  /* ********************************* */
  /* GET CONTENT ********************* */
  /* ********************************* */

  await mw.login(downloader);

  await mw.getTextDirection(env, downloader);
  await mw.getSiteInfo(env, downloader);
  await zim.getSubTitle();
  await mw.getNamespaces(addNamespaces, downloader);
  await zim.createDirectories();
  await zim.prepareCache();
  await env.checkResume();
  await getArticleIds(redirectQueue);
  await cacheRedirects();

  await doSeries(
    env.dumps.map((dump) => {
      return () => doDump(env, dump);
    }),
  );

  if (skipCacheCleaning) {
    logger.log('Skipping cache cleaning...');
    await exec(`rm -f "${zim.cacheDirectory}ref"`);
  } else {
    logger.log('Cleaning cache');
    await exec(`find "${zim.cacheDirectory}" -type f -not -newer "${zim.cacheDirectory}ref" -exec rm {} \\;`);
  }

  function doDump(env: OfflinerEnv, dump: string) {
    logger.log('Starting a new dump...');
    env.nopic = dump.toString().search('nopic') >= 0;
    env.novid = dump.toString().search('novid') >= 0;
    env.nozim = dump.toString().search('nozim') >= 0;
    env.nodet = dump.toString().search('nodet') >= 0;
    env.keepHtml = env.nozim || env.keepHtml;
    env.htmlRootPath = env.computeHtmlRootPath();

    return doSeries([
      () => zim.createSubDirectories(),
      zim.mobileLayout ? () => saveStaticFiles() : null,
      () => saveStylesheet(),
      () => saveFavicon(),
      () => getMainPage(),
      env.writeHtmlRedirects ? () => saveHtmlRedirects() : null,
      () => saveArticles(dump),
      () => drainDownloadFileQueue(),
      () => drainOptimizationQueue(optimizationQueue),
      () => zim.buildZIM(),
      () => redis.delMediaDB(),
    ]);
  }

  await redis.flushDBs();
  await redis.quit();
  logger.log('Closing HTTP agents...');
  await closeAgents();

  logger.log('All dumping(s) finished with success.');

  /* ********************************* */
  /* FUNCTIONS *********************** */
  /* ********************************* */

  function closeAgents() {
    http.globalAgent.destroy();
    https.globalAgent.destroy();
    return Promise.resolve();
  }

  function saveStaticFiles() {
    return new Promise((resolve, reject) => {
      config.output.cssResources.forEach((css) => {
        try {
          fs.readFile(pathParser.resolve(__dirname, `../res/${css}.css`), (err, data) => fs.writeFile(pathParser.resolve(env.htmlRootPath, cssPath(css)), data, () => null));
        } catch (error) {
          console.error(`Could not create ${css} file : ${error}`);
        }
      });

      config.output.jsResources.forEach(function (js) {
        try {
          fs.readFile(pathParser.resolve(__dirname, `../res/${js}.js`), (err, data) =>
            fs.writeFile(pathParser.resolve(env.htmlRootPath, jsPath(js)), data, () => {
              const noop = 1;
            }),
          );
        } catch (error) {
          console.error(`Could not create ${js} file : ${error}`);
        }
      });
      resolve();
    });
  }

  function drainDownloadFileQueue() {
    return new Promise((resolve, reject) => {
      logger.log(`${downloadFileQueue.length()} images still to be downloaded.`);
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
          downloadFileQueue.push('');
        },
      );
    });
  }

  function drainOptimizationQueue(optimizationQueue) {
    return new Promise((resolve, reject) => {
      logger.log(`${optimizationQueue.length()} images still to be optimized.`);
      async.doWhilst(
        (doneWait) => {
          if (optimizationQueue.idle()) {
            logger.log('Process still optimizing images...');
          }
          setTimeout(doneWait, 1000);
        },
        () => !optimizationQueue.idle(),
        () => {
          const drainBackup = optimizationQueue.drain;
          optimizationQueue.drain = function (error) {
            if (error) {
              reject(`Error by optimizing images ${error}`);
            } else {
              if (optimizationQueue.length() === 0) {
                logger.log('All images successfuly optimized');
                optimizationQueue.drain = drainBackup;
                resolve();
              }
            }
          } as any;
          optimizationQueue.push({ path: '', size: 0 });
        },
      );
    });
  }

  function cacheRedirects() {
    logger.log('Reset redirects cache file (or create it)');
    fs.openSync(zim.redirectsCacheFile, 'w');

    logger.log('Caching redirects...');
    function cacheRedirect(redirectId, finished) {
      redis.getRedirect(redirectId, finished, (target) => {
        logger.log(`Caching redirect ${redirectId} (to ${target})...`);
        const line = 'A\t'
          + `${env.getArticleBase(redirectId)}\t`
          + `${redirectId.replace(/_/g, ' ')}\t`
          + `${env.getArticleBase(target, false)}\n`;
        fs.appendFile(zim.redirectsCacheFile, line, finished);
      });
    }

    return redis.processAllRedirects(speed, cacheRedirect,
      'Unable to cache a redirect',
      'All redirects were cached successfuly.',
    );
  }

  function saveHtmlRedirects() {
    return new Promise((resolve, reject) => {
      logger.log('Saving HTML redirects...');

      function saveHtmlRedirect(redirectId, finished) {
        redis.getRedirect(redirectId, finished, (target) => {
          logger.log(`Writing HTML redirect ${redirectId} (to ${target})...`);
          const data = redirectTemplate({
            target: env.getArticleUrl(target),
            title: redirectId.replace(/_/g, ' '),
          });
          if (env.deflateTmpHtml) {
            zlib.deflate(data, (error, deflatedHtml) => {
              fs.writeFile(env.getArticlePath(redirectId), deflatedHtml, finished);
            });
          } else {
            fs.writeFile(env.getArticlePath(redirectId), data, finished);
          }
        });
      }

      redis.processAllRedirects(speed, saveHtmlRedirect,
        'Unable to save a HTML redirect',
        'All redirects were saved successfuly as HTML files.',
      ).then(resolve, reject);
    });
  }

  function saveArticles(dump) {
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
          .then(({
            parse: {
              modules, modulescripts, modulestyles, headhtml,
            },
          }) => {
            jsDependenciesList = genericJsModules.concat(modules, modulescripts).filter((a) => a);
            styleDependenciesList = [].concat(modules, modulestyles, genericCssModules).filter((a) => a);

            styleDependenciesList = styleDependenciesList.filter(
              (oneStyleDep) => contains(config.filters.blackListCssModules, oneStyleDep),
            );

            logger.log(`Js dependencies of ${articleId} : ${jsDependenciesList}`);
            logger.log(`Css dependencies of ${articleId} : ${styleDependenciesList}`);

            const allDependenciesWithType = [
              { type: 'js', moduleList: jsDependenciesList },
              { type: 'css', moduleList: styleDependenciesList },
            ];

            allDependenciesWithType.forEach(({ type, moduleList }) => moduleList.forEach((oneModule) => downloadAndSaveModule(oneModule, type)));

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
              fs.writeFileSync(pathParser.resolve(env.htmlRootPath, jsPath('jsConfigVars')), jsConfigVars);
              logger.log(`created dep jsConfigVars.js for article ${articleId}`);
            } catch (e) {
              console.error('Error writing file', e);
            }

            finished(null, parsoidDoc, articleId);
          })
          .catch((e) => {
            console.log(`Error fetching api.php for ${articleApiUrl} ${e}`);
            finished(null, parsoidDoc, articleId); // calling finished here will allow zim generation to continue event if an article doesn't properly get its modules
          });

        const downloadAndSaveModule = (module, type) => {
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
            `${mw.base}w/load.php?debug=false&lang=en&modules=${module}&only=${apiParameterOnly}&skin=vector&version=&*`,
          );
          redis.saveModuleIfNotExists(dump, module, moduleUri, type)
            .then((redisResult) => {
              if (redisResult === 1) {
                return fetch(moduleApiUrl, {
                  method: 'GET',
                  headers: { Accept: 'text/plain' },
                })
                  .then((response) => response.text())
                  .then((text) => {
                    if (module === 'startup' && type === 'js') {
                      text = hackStartUpModule(text);
                    } else if (module === 'mediawiki' && type === 'js') {
                      text = hackMediaWikiModule(text);
                    }

                    try {
                      fs.writeFileSync(moduleUri, text);
                      logger.log(`created dep ${module} for article ${articleId}`);
                    } catch (e) {
                      console.error(`Error writing file ${moduleUri} ${e}`);
                    }
                  })
                  .catch((e) => console.error(`Error fetching load.php for ${articleId} ${e}`));
              }
              return Promise.resolve();
            })
            .catch((e) => console.error(e));
        };
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
            downloadFileQueue.push(videoPosterUrl);
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
            downloadFileQueue.push(sourceUrl);
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
                  downloadFileQueue.push(src);
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

            if (
              imageNodeTypeof.indexOf('mw:Image/Thumb') >= 0
              || imageNodeTypeof.indexOf('mw:Video/Thumb') >= 0
              || zim.mobileLayout
            ) {
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
            } else if (imageNodeTypeof.indexOf('mw:Image') >= 0) {
              const div = parsoidDoc.createElement('div');
              if (imageNodeClass.search('mw-halign-right') >= 0) {
                DU.appendToAttr(div, 'class', 'floatright');
              } else if (imageNodeClass.search('mw-halign-left') >= 0) {
                DU.appendToAttr(div, 'class', 'floatleft');
              } else if (imageNodeClass.search('mw-halign-center') >= 0) {
                DU.appendToAttr(div, 'class', 'center');
              }
              div.appendChild(isStillLinked ? image.parentNode : image);
              imageNode.parentNode.replaceChild(div, imageNode);
            }
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
          (zim.mobileLayout ? htmlMobileTemplateCode : htmlDesktopTemplateCode)
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
        if (zim.mobileLayout) {
          htmlTemplateDoc.getElementsByTagName('title')[0].innerHTML = htmlTemplateDoc.getElementById('title_0')
            ? htmlTemplateDoc.getElementById('title_0').textContent
            : articleId.replace(/_/g, ' ');
          DU.deleteNode(htmlTemplateDoc.getElementById('titleHeading'));
        } else {
          htmlTemplateDoc.getElementsByTagName('title')[0].innerHTML = parsoidDoc.getElementsByTagName('title')
            ? parsoidDoc.getElementsByTagName('title')[0].textContent.replace(/_/g, ' ')
            : articleId.replace(/_/g, ' ');
          if (zim.mainPageId !== articleId) {
            htmlTemplateDoc.getElementById('titleHeading').innerHTML = htmlTemplateDoc.getElementsByTagName('title')[
              0
            ].innerHTML;
          } else {
            DU.deleteNode(htmlTemplateDoc.getElementById('titleHeading'));
          }
        }

        /* Subpage */
        if (isSubpage(articleId) && zim.mainPageId !== articleId) {
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
        const oldId = articleIds[articleId];
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
              creator: zim.creator,
              oldId,
              date: date.toISOString().substring(0, 10),
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
            fs.writeFile(env.getArticlePath(articleId), deflatedHtml, finished);
          });
        } else {
          fs.writeFile(env.getArticlePath(articleId), html, finished);
        }
      }

      function saveArticle(articleId, finished) {
        let html = '';
        if (zim.mobileLayout && zim.mainPageId !== articleId) {
          const articleApiUrl = `${mw.base}api/rest_v1/page/mobile-sections/${encodeURIComponent(articleId)}`;
          logger.log(`Getting (mobile) article from ${articleApiUrl}`);
          fetch(articleApiUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          })
            .then((response) => response.json())
            .then((json) => {
              // set the first section (open by default)
              html += leadSectionTemplate({
                lead_display_title: json.lead.displaytitle,
                lead_section_text: json.lead.sections[0].text,
              });

              // set all other section (closed by default)
              if (!env.nodet) {
                json.remaining.sections.forEach((oneSection, i) => {
                  if (i === 0 && oneSection.toclevel !== 1) { // We need at least one Top Level Section
                    html += sectionTemplate({
                      section_index: i,
                      section_id: i,
                      section_anchor: 'TopLevelSection',
                      section_line: 'Disambiguation',
                      section_text: '',
                    });
                  }

                  // if below is to test if we need to nest a subsections into a section
                  if (oneSection.toclevel === 1) {
                    html = html.replace(`__SUB_LEVEL_SECTION_${oneSection.id - 1}__`, ''); // remove unused anchor for subsection
                    html += sectionTemplate({
                      section_index: i + 1,
                      section_id: oneSection.id,
                      section_anchor: oneSection.anchor,
                      section_line: oneSection.line,
                      section_text: oneSection.text,
                    });
                  } else {
                    const replacement = subSectionTemplate({
                      section_index: i + 1,
                      section_toclevel: oneSection.toclevel + 1,
                      section_id: oneSection.id,
                      section_anchor: oneSection.anchor,
                      section_line: oneSection.line,
                      section_text: oneSection.text,
                    });
                    html = html.replace(`__SUB_LEVEL_SECTION_${oneSection.id - 1}__`, replacement);
                  }
                });
              }

              html = html.replace(`__SUB_LEVEL_SECTION_${json.remaining.sections.length}__`, ''); // remove the last subcestion anchor (all other anchor are removed in the forEach)
              buildArticleFromApiData();
            })
            .catch((e) => {
              console.error(`Error handling json response from api. ${e}`);
              buildArticleFromApiData();
            });
        } else {
          const articleUrl = parsoidUrl
            + encodeURIComponent(articleId)
            + (parsoidUrl.indexOf('/rest') < 0 ? `${parsoidUrl.indexOf('?') < 0 ? '?' : '&'}oldid=` : '/')
            + articleIds[articleId];
          logger.log(`Getting (desktop) article from ${articleUrl}`);
          setTimeout(
            skipHtmlCache || articleId === zim.mainPageId
              ? downloader.downloadContent.bind(downloader)
              : downloadContentAndCache,
            downloadFileQueue.length() + optimizationQueue.length(),
            articleUrl,
            (content) => {
              let json;
              if (parsoidContentType === 'json') {
                try {
                  json = JSON.parse(content.toString());
                } catch (e) {
                  // TODO: Figure out why this is happening
                  html = content.toString();
                  console.error(e);
                }
                if (json && json.visualeditor) {
                  html = json.visualeditor.content;
                } else if (json && json.contentmodel === 'wikitext') {
                  html = json.html.body;
                } else if (json && json.error) {
                  console.error(`Error by retrieving article: ${json.error.info}`);
                } else {
                  html = content.toString();
                }
              } else {
                html = content.toString();
              }
              buildArticleFromApiData();
            },
            articleId,
          );
        }

        function buildArticleFromApiData() {
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

            logger.log(`Treating and saving article ${articleId} at ${articlePath}...`);
            prepareAndSaveArticle(html, articleId, (error) => {
              if (!error) { logger.log(`Successfully dumped article ${articleId}`); }
              finished(error && { message: `Error preparing and saving file`, error });
            });
          } else {
            delete articleIds[articleId];
            finished();
          }
        }
      }

      logger.log('Saving articles...');
      async.eachLimit(Object.keys(articleIds), speed, saveArticle, (error) => {
        if (error) {
          reject({ message: `Unable to retrieve an article correctly`, error });
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
    if (!zim.articleList && id && id.indexOf(':') >= 0) {
      const namespace = mw.namespaces[id.substring(0, id.indexOf(':')).replace(/ /g, mw.spaceDelimiter)];
      if (namespace !== undefined) {
        return namespace.isContent;
      }
    }
    return id in articleIds;
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
  function saveStylesheet() {
    return new Promise((resolve, reject) => {
      logger.log('Dumping stylesheets...');
      const urlCache = {};
      const stylePath = `${env.htmlRootPath}${dirs.style}/style.css`;

      /* Remove if exists */
      fs.unlink(stylePath, () => null);

      /* Take care to download medias */
      const downloadCSSFileQueue = async.queue((data: any, finished) => {
        downloader.downloadMediaFile(data.url, data.path, true, optimizationQueue, finished);
      }, speed);

      /* Take care to download CSS files */
      const downloadCSSQueue = async.queue((link: any, finished) => {
        /* link might be a 'link' DOM node or an URL */
        const cssUrl = typeof link === 'object' ? U.getFullUrl(webUrlHost, link.getAttribute('href')) : link;
        const linkMedia = typeof link === 'object' ? link.getAttribute('media') : null;

        if (cssUrl) {
          const cssUrlRegexp = new RegExp('url\\([\'"]{0,1}(.+?)[\'"]{0,1}\\)', 'gi');

          logger.log(`Downloading CSS from ${decodeURI(cssUrl)}`);
          downloader.downloadContent(cssUrl, (content) => {
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
                  const filename = pathParser.basename(filePathname);

                  /* Rewrite the CSS */
                  rewrittenCss = rewrittenCss.replace(url, filename);

                  /* Need a rewrite if url doesn't include protocol */
                  url = U.getFullUrl(webUrlHost, url, cssUrl);
                  url = url.indexOf('%') < 0 ? encodeURI(url) : url;

                  /* Download CSS dependency, but avoid duplicate calls */
                  if (!urlCache.hasOwnProperty(url) && filename) {
                    urlCache[url] = true;
                    downloadCSSFileQueue.push({ url, path: env.htmlRootPath + dirs.style + '/' + filename });
                  }
                } else {
                  console.warn(`Skipping CSS [url(${url})] because the pathname could not be found [${filePathname}]`);
                }
              }
            }

            fs.appendFileSync(stylePath, rewrittenCss);
            finished();
          });
        } else {
          finished();
        }
      }, speed);

      /* Load main page to see which CSS files are needed */
      downloadContentAndCache(mw.webUrl, (content) => {
        const html = content.toString();
        const doc = domino.createDocument(html);
        const links = doc.getElementsByTagName('link');

        /* Go through all CSS links */
        // tslint:disable-next-line:prefer-for-of
        for (let i = 0; i < links.length; i += 1) {
          const link = links[i];
          if (link.getAttribute('rel') === 'stylesheet') {
            downloadCSSQueue.push(link);
          }
        }

        /* Push Mediawiki:Offline.css ( at the end) */
        const offlineCssUrl = `${mw.webUrl}Mediawiki:offline.css?action=raw`;
        downloader.registerOptionalUrl(offlineCssUrl);
        downloadCSSQueue.push(offlineCssUrl);

        /* Set the drain method to be called one time everything is done */
        downloadCSSQueue.drain = function drain(error) {
          if (error) {
            return reject({ message: `Error in CSS dependencies`, error });
          }
          const drainBackup = downloadCSSQueue.drain;
          downloadCSSFileQueue.drain = function downloadCSSFileQueueDrain(error) {
            if (error) {
              reject({ message: `Error in CSS medias`, error });
            } else {
              downloadCSSQueue.drain = drainBackup;
              resolve();
            }
          } as any;
          downloadCSSFileQueue.push('');
        } as any;
        downloadCSSQueue.push('');
      });
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
            console.error(`Article ${entry.title} is not available on this wiki.`);
            delete articleIds[entry.title];
          } else {
            redirectQueueValues.push(entry.title);

            if (entry.revisions) {
              /* Get last revision id */
              articleIds[entry.title] = entry.revisions[0].revid;

              /* Get last revision id timestamp */
              const articleDetails: { t: number, g?: string } = { t: new Date(entry.revisions[0].timestamp).getTime() / 1000 };

              /* Get article geo coordinates */
              if (entry.coordinates) {
                articleDetails.g = `${entry.coordinates[0].lat};${entry.coordinates[0].lon}`;
              }

              /* Save as JSON string */
              details[entry.title] = JSON.stringify(articleDetails);
            } else if (entry.pageid) {
              logger.log(`Unable to get revisions for ${entry.title}, but entry exists in the database. Article was probably deleted meanwhile.`);
              delete articleIds[entry.title];
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
          const f = downloader.downloadContent.bind(downloader, mw.articleQueryUrl(title));
          setTimeout(f, redirectQueue.length() > 30000 ? redirectQueue.length() - 30000 : 0, (content) => {
            const body = content.toString();
            if (body && body.length > 1) {
              parseAPIResponse(body);
            }
            setTimeout(resolve, redirectQueue.length());
          });
        } else {
          resolve();
        }
      });
    }

    /* Get ids from file */
    function getArticleIdsForFile() {
      return new Promise((resolve, reject) => {
        let lines;
        try {
          lines = fs.readFileSync(zim.articleList).toString().split('\n');
        } catch (error) {
          reject(`Unable to open article list file: ${error}`);
        }

        async.eachLimit(lines, speed, (line, finish) => getArticleIdsForLine(redirectQueue, line).then(() => finish(), (err) => finish(err)), (error) => {
          if (error) {
            reject(`Unable to get all article ids for a file: ${error}`);
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
          setTimeout(dc, redirectQueue.length() > 30000 ? redirectQueue.length() - 30000 : 0, url, (content) => {
            const body = content.toString();
            if (body && body.length > 1) {
              next = parseAPIResponse(body);
              finished();
            } else {
              next = '';
              finished({ message: `Error by retrieving ${url}` });
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
      () => getArticleIdsForLine(redirectQueue, zim.mainPageId),
      () => {
        if (zim.articleList) {
          return getArticleIdsForFile();
        } else {
          return getArticleIdsForNamespaces();
        }
      },
      () => {
        if (!zim.articleList && !isMirrored(zim.mainPageId)) {
          return getArticleIdsForLine(redirectQueue, zim.mainPageId);
        } else {
          return Promise.resolve();
        }
      },
    ]);
  }

  /* Multiple developer friendly functions */
  function downloadContentAndCache(url, callback) {
    const cachePath = zim.cacheDirectory + crypto.createHash('sha1').update(url).digest('hex').substr(0, 20);
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
              finished({ message: `Error in downloadContentAndCache() JSON parsing of ${cacheHeadersPath}`, error });
            }
          });
        },
      ],
      (error, results) => {
        if (error) {
          downloader.downloadContent(url, (content, responseHeaders) => {
            logger.log(`Caching ${url} at ${cachePath}...`);
            fs.writeFile(cacheHeadersPath, JSON.stringify(responseHeaders), () => {
              fs.writeFile(cachePath, content, () => {
                callback(content, responseHeaders);
              });
            });
          });
        } else {
          logger.log(`Cache hit for ${url} (${cachePath})`);
          U.touch(cachePath);
          callback(results[0], results[1]);
        }
      },
    );
  }

  function downloadFileAndCache(url, callback) {
    if (!url) {
      callback();
      return;
    }

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
          const mediaPath = getMediaPath(url);
          const cachePath = `${zim.cacheDirectory}m/${crypto.createHash('sha1').update(filenameBase).digest('hex').substr(0, 20)}${pathParser.extname(urlParser.parse(url, false, true).pathname || '') || ''}`;
          const cacheHeadersPath = `${cachePath}.h`;
          let toDownload = false;

          /* Check if the file exists in the cache */
          if (fs.existsSync(cacheHeadersPath) && fs.existsSync(cachePath)) {
            let responseHeaders;
            try {
              responseHeaders = JSON.parse(fs.readFileSync(cacheHeadersPath).toString());
            } catch (err) {
              console.error(`Error in downloadFileAndCache() JSON parsing of ${cacheHeadersPath}, error is:`, err);
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
            downloader.downloadMediaFile(url, cachePath, true, optimizationQueue, (error) => {
              if (error) {
                callback();
              } else {
                logger.log(`Caching ${filenameBase} at ${cachePath}...`);
                fs.symlink(cachePath, mediaPath, 'file', (error) => {
                  if (error && error.code !== 'EEXIST') {
                    return callback({ message: `Unable to create symlink to ${mediaPath} at ${cachePath}`, error });
                  }
                  fs.writeFile(cacheHeadersPath, JSON.stringify({ width }), (error) => {
                    return callback(error && { message: `Unable to write cache header at ${cacheHeadersPath}`, error });
                  });
                });
              }
            });
          } else {
            logger.log(`Cache hit for ${url}`);
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
      console.error(`Unable to parse media url "${url}"`);
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

  function saveFavicon() {
    return new Promise((resolve, reject) => {
      logger.log('Saving favicon.png...');

      function resizeFavicon(faviconPath) {
        return new Promise((resolve, reject) => {
          const cmd = `convert -thumbnail 48 "${faviconPath}" "${faviconPath}.tmp" ; mv "${faviconPath}.tmp" "${faviconPath}" `;
          exec(cmd, (error) => {
            fs.stat(faviconPath, (error, stats) => {
              optimizationQueue.push({ path: faviconPath, size: stats.size }, () => {
                if (error) {
                  reject(error);
                } else {
                  resolve();
                }
              });
            });
          }).on('error', (error) => {
            reject(error);
            // console.error(error);
          });
        });
      }

      if (customZimFavicon) {
        const faviconPath = env.htmlRootPath + 'favicon.png';
        const content = fs.readFileSync(customZimFavicon);
        fs.writeFileSync(faviconPath, content);
        resizeFavicon(faviconPath).then(resolve, reject);
      } else {
        downloader.downloadContent(mw.siteInfoUrl(), (content) => {
          const body = content.toString();
          const entries = JSON.parse(body).query.general;
          if (!entries.logo) {
            return reject(`********\nNo site Logo Url. Expected a string, but got [${entries.logo}].\n\nPlease try specifying a customZimFavicon (--customZimFavicon=./path/to/your/file.ico)\n********`);
          }

          const parsedUrl = urlParser.parse(entries.logo);
          const ext = parsedUrl.pathname.split('.').slice(-1)[0];
          const faviconPath = env.htmlRootPath + `favicon.${ext}`;
          const faviconFinalPath = env.htmlRootPath + `favicon.png`;
          const logoUrl = parsedUrl.protocol ? entries.logo : 'http:' + entries.logo;
          downloader.downloadMediaFile(logoUrl, faviconPath, true, optimizationQueue, async () => {
            if (ext !== 'png') {
              console.warn(`Original favicon is not a PNG ([${ext}]). Converting it to PNG`);
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
            resizeFavicon(faviconFinalPath).then(resolve, reject);
          });
        });
      }
    });
  }

  function getMainPage() {
    return new Promise((resolve, reject) => {
      function writeMainPage(html) {
        const mainPagePath = `${env.htmlRootPath}index.htm`;
        if (env.deflateTmpHtml) {
          return new Promise((resolve, reject) => {
            zlib.deflate(html, (error, deflatedHtml) => {
              writeFilePromise(mainPagePath, deflatedHtml).then(resolve, reject);
            });
          });
        } else {
          return writeFilePromise(mainPagePath, html);
        }
      }

      function createMainPage() {
        logger.log('Creating main page...');
        const doc = domino.createDocument(
          (zim.mobileLayout ? htmlMobileTemplateCode : htmlDesktopTemplateCode)
            .replace('__ARTICLE_JS_LIST__', '')
            .replace('__ARTICLE_CSS_LIST__', '')
            .replace('__ARTICLE_CONFIGVARS_LIST__', ''),
        );
        doc.getElementById('titleHeading').innerHTML = 'Summary';
        doc.getElementsByTagName('title')[0].innerHTML = 'Summary';

        let html = '<ul>\n';
        Object.keys(articleIds).sort().forEach((articleId) => {
          html += `<li><a href="${env.getArticleBase(articleId, true)}">${articleId.replace(/_/g, ' ')}<a></li>\n`;
        });
        html += '</ul>\n';
        doc.getElementById('mw-content-text').innerHTML = html;

        /* Write the static html file */
        return writeMainPage(doc.documentElement.outerHTML);
      }

      function createMainPageRedirect() {
        return new Promise((resolve, reject) => {
          logger.log('Create main page redirection...');
          const html = redirectTemplate({
            title: zim.mainPageId.replace(/_/g, ' '),
            target: env.getArticleBase(zim.mainPageId, true),
          });
          writeMainPage(html).then(resolve, reject);
        });
      }

      if (zim.mainPageId) {
        createMainPageRedirect().then(resolve, reject);
      } else {
        createMainPage().then(resolve, reject);
      }
    });
  }

}

export {
  getParametersList,
  execute,
};
