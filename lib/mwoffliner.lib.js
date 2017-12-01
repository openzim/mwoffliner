'use strict';

/************************************/
/* MODULE VARIABLE SECTION **********/
/************************************/

const fs = require('fs');
const domino = require('domino');
const async = require('async');
const http = require('follow-redirects').http;
const https = require('follow-redirects').https;
const zlib = require('zlib');
const swig = require('swig');
const urlParser = require('url');
const pathParser = require('path');
const redis = require('redis');
const exec = require('child_process').exec;
const os = require('os');
const crypto = require('crypto');
const unicodeCutter = require('utf8-binary-cutter');
const htmlMinifier = require('html-minifier');
const parsoid = require('parsoid');
const fetch = require('node-fetch');

require('./jsutils.js'); // we should avoid monkey-patching
const config = require('./config.js').config;
const Downloader = require('./Downloader.js').Downloader;
const DU = require('./DOMUtils.js').DOMUtils;
const Logger = require('./Logger.js').Logger;
const MediaWiki = require('./MediaWiki.js').MediaWiki;
const U = require('./Utils.js').Utils;
const Zim = require('./Zim.js').Zim;

const OfflinerEnv = require('./OfflinerEnv.js').OfflinerEnv;
const { parameterList } = require('./parameterList');

function getParametersList() {
  return parameterList; // Want to remove this anonymous function. Need to investigate to see if it's needed
}

function execute(argv) {
  /************************************/
  /* CUSTOM VARIABLE SECTION **********/
  /************************************/

  /* HTTP user-agent string */
  const adminEmail = argv.adminEmail;
  if (!U.validateEmail(adminEmail)) {
    console.error('Admin email ' + adminEmail + ' is not valid');
    process.exit(1);
  }

  /* Parsoid URL */
  let parsoidUrl = argv.parsoidUrl;
  const localParsoid = argv.localParsoid;

  /* ZIM custom Favicon */
  const customZimFavicon = argv.customZimFavicon;
  if (customZimFavicon && !fs.existsSync(customZimFavicon)) {
    console.error('Path "' + customZimFavicon + '" is not a valid PNG file.');
    process.exit(1);
  }

  /* Number of parallel requests */
  const cpuCount = os.cpus().length;
  if (argv.speed && isNaN(argv.speed)) {
    console.error('speed is not a number, please give a number value to --speed');
    process.exit(1);
  }
  const speed = cpuCount * (argv.speed || 1);

  /* Necessary to avoid problems with https */
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  /* Verbose */
  const verbose = argv.verbose;

  /* Optimize HTML */
  const minifyHtml = argv.minifyHtml;

  /* Cache strategy */
  const skipHtmlCache = argv.skipHtmlCache;
  const skipCacheCleaning = argv.skipCacheCleaning;

  /* Redis configuration */
  const redisConf = argv.redis ? argv.redis : config.defaults.redisConfig;

  /* Keep empty paragraphs */
  const keepEmptyParagraphs = argv.keepEmptyParagraphs;

  /* logger */
  const logger = new Logger(verbose);

  /* Wikipedia/... URL; Normalize by adding trailing / as necessary */
  const mw = new MediaWiki(logger, {
    base: argv.mwUrl,
    wikiPath: argv.mwWikiPath,
    apiPath: argv.mwApiPath,
    domain: argv.mwDomain,
    username: argv.mwUsername,
    password: argv.mwPassword,
    spaceDelimiter: argv.spaceDelimiter || '_'
  });

  /* Download helpers; TODO: Merge with something else / expand this. */
  const downloader = new Downloader(
    logger,
    mw,
    config.userAgent + ' (' + adminEmail + ')',
    argv.requestTimeout || config.defaults.requestTimeout
  );

  /*
         * Find a suitable name to use for ZIM (content) creator
         * Heuristic: Use basename of the domain unless
         * - it happens to be a wikimedia project OR
         * - some domain where the second part of the hostname is longer than the first part
         */
  const hostParts = urlParser.parse(mw.base).hostname.split('.');
  let creator = hostParts[0];
  if (hostParts.length > 1) {
    const wmProjects = [
      'wikipedia',
      'wikisource',
      'wikibooks',
      'wikiquote',
      'wikivoyage',
      'wikiversity',
      'wikinews',
      'wiktionary'
    ];
    if (wmProjects.contains(hostParts[1]) || hostParts[0].length < hostParts[1].length) {
      creator = hostParts[1]; // Name of the wikimedia project
    }
  }
  creator = creator.charAt(0).toUpperCase() + creator.substr(1);

  /************************************/
  /* SYSTEM VARIABLE SECTION **********/
  /************************************/

  const zimOpts = {
    // Name to use for ZIM (content) creator
    creator: creator,

    // ZIM publisher
    publisher: argv.publisher || config.defaults.publisher,

    langIso2: 'en',
    langIso3: 'eng',

    // List of articles is maybe in a file
    articleList: argv.articleList,

    mainPageId: argv.customMainPage || '',
    name: argv.customZimTitle || '',
    description: argv.customZimDescription || '',
    cacheDirectory: (argv.cacheDirectory ? argv.cacheDirectory : pathParser.resolve(process.cwd(), 'cac')) + '/',

    // Layout
    mobileLayout: argv.mobileLayout || false,

    // File where redirects might be save if --writeHtmlRedirects is not set
    redirectsCacheFile: null,

    // Directory wehre everything is saved at the end of the process
    outputDirectory: argv.outputDirectory,

    // Directory where temporary data are saved
    tmpDirectory: argv.tmpDirectory,

    // Include fulltext index in ZIM file
    withZimFullTextIndex: argv.withZimFullTextIndex,

    // What is this?
    subTitle: ''
  };
  const zim = new Zim(zimOpts);

  const date = new Date();

  // Temporary stub env for now to encapsulate state and pass around
  // where it is required. This might eventually take a different form
  // after refactoring is complete.
  const env = new OfflinerEnv(argv.format, {
    zim: zim,
    mw: mw,
    logger: logger,
    downloader: downloader,
    // Prefix part of the filename (radical)
    filenamePrefix: argv.filenamePrefix || '',

    // output config (FIXME: Does this belong in Zim?)
    nopic: false,
    novid: false,
    nozim: false,
    nodet: false,

    // Script direction (defaults to ltr)
    ltr: true,

    // Content date (FIXME: Does this belong in Zim?)
    contentDate: date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2),

    htmlRootPath: '',

    // If ZIM is built, should temporary HTML directory be kept
    keepHtml: argv.keepHtml,

    // Should we keep ZIM file generation if ZIM file already exists
    resume: argv.resume,

    verbose: verbose,
    deflateTmpHtml: argv.deflateTmpHtml,
    // How to write redirects
    writeHtmlRedirects: argv.writeHtmlRedirects
  });

  const INFINITY_WIDTH = 9999999;
  const articleIds = {};
  const webUrlHost = urlParser.parse(mw.webUrl).host;
  const webUrlPath = urlParser.parse(mw.webUrl).pathname;
  const apiUrl = mw.apiUrl;
  let parsoidContentType = 'html';
  const addNamespaces = argv.addNamespaces ? String(argv.addNamespaces).split(',') : [];

  if (!parsoidUrl) {
    if (localParsoid) {
      console.info('Starting Parsoid');
      //Icky but necessary
      fs.writeFileSync(
        './localsettings.js',
        `
                exports.setup = function(parsoidConfig) {
                    parsoidConfig.setMwApi({
                        uri: '${mw.base + mw.apiPath}',
                    });
                };
                `,
        'utf8'
      );
      parsoid
        .apiServiceWorker({
          appBasePath: './node_modules/parsoid',
          logger: console,
          config: { localsettings: '../../localsettings.js' }
        })
        .then(_ => {
          fs.unlinkSync('./localsettings.js');
          console.info('Parsoid Started Successfully');
        })
        .catch(err => {
          console.error(`Error starting Parsoid: ${err}`);
          process.exit(1);
        });
      parsoidUrl = `http://localhost:8000/${webUrlHost}/v3/page/pagebundle/`;
      parsoidContentType = 'json';
    } else {
      parsoidUrl = apiUrl + 'action=visualeditor&format=json&paction=parse&page=';
      parsoidContentType = 'json';
    }
  }
  let filenameRadical = '';

  /************************************/
  /* RUNNING CODE *********************/
  /************************************/

  /* Check if opt. binaries are available */
  const optBinaries = [
    'jpegoptim --version',
    'pngquant --version',
    'gifsicle --version',
    'advdef --version',
    'file --help',
    'stat --version',
    'convert --version'
  ];
  try {
    env.dumps.forEach(function(dump) {
      if (dump.toLowerCase().indexOf('nozim') < 0) {
        optBinaries.push('zimwriterfs --help');
        throw 'BreakException'; // breakException not defined. Nedd to fix.
      }
    });
  } catch (e) {
    () => {}; // empty function because catches require
  }
  optBinaries.forEach(function(cmd) {
    exec(
      cmd,
      function(error, stdout, stderr) {
        if (error) {
          console.error('Failed to find binary "' + cmd.split(' ')[0] + '": (' + error + ')');
          process.exit(1);
        }
      },
      true,
      true
    );
  });

  /* Setup redis client */
  const redisClient = redis.createClient(redisConf);
  const redisNamePrefix = new Date().getTime();
  const redisRedirectsDatabase = redisNamePrefix + 'r';
  const redisMediaIdsDatabase = redisNamePrefix + 'm';
  const redisArticleDetailsDatabase = redisNamePrefix + 'd';
  const redisModuleDatabase = redisNamePrefix + 'mod';
  const redisCachedMediaToCheckDatabase = redisNamePrefix + 'c';

  /* Some helpers */
  const readTemplate = function(t) {
    return fs.readFileSync(pathParser.resolve(__dirname, t), 'utf-8');
  };
  const dirs = config.output.dirs;
  const cssPath = function(css) {
    return [dirs.style, dirs.styleModules, css.replace(/(\.css)?$/, '') + '.css'].join('/');
  };
  const jsPath = function(js) {
    return [dirs.javascript, dirs.jsModules, js.replace(/(\.js)?$/, '') + '.js'].join('/');
  };
  const genHeaderCSSLink = function(css) {
    return '<link href="' + cssPath(css) + '" rel="stylesheet" type="text/css" />';
  };
  const genHeaderScript = function(js) {
    return '<script src="' + jsPath(js) + '"></script>';
  };

  const cssLinks = config.output.cssResources.reduce(function(buf, css) {
    return buf + genHeaderCSSLink(css);
  }, '');

  /* Compile templates */
  const redirectTemplate = swig.compile(readTemplate(config.output.templates.redirects));
  const footerTemplate = swig.compile(readTemplate(config.output.templates.footer));

  /************************************/
  /* CONSTANT VARIABLE SECTION ********/
  /************************************/

  const genericJsModules = config.output.mw.js;
  const genericCssModules = zim.mobileLayout ? config.output.mw.css.mobile : config.output.mw.css.desktop;

  const mediaRegex = /^(.*\/)([^\/]+)(\/)(\d+px-|)(.+?)(\.[A-Za-z0-9]{2,6}|)(\.[A-Za-z0-9]{2,6}|)$/;
  const htmlMobileTemplateCode = readTemplate(config.output.templates.mobile).replace('__CSS_LINKS__', cssLinks);
  const htmlDesktopTemplateCode = readTemplate(config.output.templates.desktop);
  /* Get content */
  async.series(
    [
      finished => mw.login(downloader, finished),
      finished => mw.getTextDirection(env, finished),
      finished => mw.getSiteInfo(env, finished),
      finished => zim.getSubTitle(finished),
      finished => mw.getNamespaces(addNamespaces, downloader, finished),
      finished => zim.createDirectories(finished),
      finished => zim.prepareCache(finished),
      finished => env.checkResume(finished),
      finished => getArticleIds(finished),
      finished => cacheRedirects(finished),
      finished => {
        async.eachSeries(
          env.dumps,
          (dump, finished) => {
            logger.log('Starting a new dump...');
            env.nopic = dump.toString().search('nopic') >= 0 ? true : false;
            env.novid = dump.toString().search('novid') >= 0 ? true : false;
            env.nozim = dump.toString().search('nozim') >= 0 ? true : false;
            env.nodet = dump.toString().search('nodet') >= 0 ? true : false;
            env.keepHtml = env.nozim || env.keepHtml;
            filenameRadical = env.computeFilenameRadical();
            env.htmlRootPath = env.computeHtmlRootPath();

            async.series(
              [
                finished => createSubDirectories(finished),
                finished => zim.mobileLayout ? saveStaticFiles(finished) : finished(),
                finished => saveStylesheet(finished),
                finished => saveFavicon(finished),
                finished => getMainPage(finished),
                finished => env.writeHtmlRedirects ? saveHtmlRedirects(finished) : finished(),
                finished => saveArticles(dump, finished),
                finished => drainDownloadFileQueue(finished),
                finished => drainOptimizationQueue(finished),
                finished => zim.buildZIM(finished),
                finished => endProcess(finished)
              ],
              (error, result) => finished()
            );
          },
          error => {
            async.series(
              [
                finished => {
                  if (skipCacheCleaning) {
                    logger.log('Skipping cache cleaning...');
                    exec('rm -f "' + zim.cacheDirectory + 'ref"', finished);
                  } else {
                    logger.log('Cleaning cache');
                    exec(
                      'find "' +
                        zim.cacheDirectory +
                        '" -type f -not -newer "' +
                        zim.cacheDirectory +
                        'ref" -exec rm {} \\;',
                      finished
                    );
                  }
                }
              ],
              (error, result) => finished()
            );
          }
        );
      }
    ],
    error => {
      async.series(
        [
          finished => {
            logger.log('Flushing redis databases...');
            redisClient.del(
              redisRedirectsDatabase,
              redisMediaIdsDatabase,
              redisArticleDetailsDatabase,
              redisCachedMediaToCheckDatabase,
              () => {
                logger.log('Redis databases flushed.');
                finished();
              }
            );
          },
          finished => {
            logger.log('Quitting redis databases...');
            redisClient.quit();
            logger.log('Closing HTTP agents...');
            closeAgents();
            finished();
          }
        ],
        (error, result) => {
          logger.log('All dumping(s) finished with success.');

          /* Time to time the script hungs here. Forcing the exit */
          process.exit(0);
        }
      );
    }
  );

  /************************************/
  /* MEDIA RELATED QUEUES *************/
  /************************************/

  /* Setting up media optimization queue */
  const optimizationQueue = async.queue(function(file, finished) {
    const path = file.path;

    function getOptimizationCommand(path, forcedType) {
      const ext = pathParser.extname(path).split('.')[1] || '';
      const basename = path.substring(0, path.length - ext.length - 1) || '';
      const tmpExt = '.' + randomString(5) + '.' + ext;
      let tmpPath = basename + tmpExt;
      const type = forcedType || ext;

      /* Escape paths */
      path = path.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
      tmpPath = tmpPath.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');

      if (type === 'jpg' || type === 'jpeg' || type === 'JPG' || type === 'JPEG') {
        return `jpegoptim --strip-all --force --all-normal -m60 "${path}"`;
      } else if (type === 'png' || type === 'PNG') {
        return (
          `pngquant --verbose --strip --nofs --force --ext="${tmpExt}" "${path}" && ` +
          `advdef -q -z -4 -i 5 "${tmpPath}" && ` +
          `if [ $(stat -c%s "${tmpPath}") -lt $(stat -c%s "${path}") ]; then mv "${tmpPath}" "${path}"; else rm "${tmpPath}"; fi`
        );
      } else if (type === 'gif' || type === 'GIF') {
        return (
          `gifsicle --verbose --colors 64 -O3 "${path}" -o "${tmpPath}" && ` +
          `if [ $(stat -c%s "${tmpPath}") -lt $(stat -c%s "${path}") ]; then mv "${tmpPath}" "${path}"; else rm "${tmpPath}"; fi`
        );
      }
    }

    if (path && file.size) {
      fs.stat(path, function(error, stats) {
        if (!error && stats.size === file.size) {
          let cmd = getOptimizationCommand(path);

          if (cmd) {
            async.retry(
              5,
              function(finished, skip) {
                exec(cmd, function(executionError, stdout, stderr) {
                  if (executionError) {
                    fs.stat(path, function(error, stats) {
                      if (!error && stats.size > file.size) {
                        finished(null, true);
                      } else if (!error && stats.size < file.size) {
                        finished('File to optim is smaller (before optim) than it should.');
                      } else {
                        exec('file -b --mime-type "' + path + '"', function(error, stdout, stderr) {
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
                  } else {
                    finished();
                  }
                });
              },
              function(error, skip) {
                if (error) {
                  console.error(`Executing command : ${cmd}`);
                  console.error(`Failed to optim ${path}, with size=${file.size} (${error})`);
                } else if (skip) {
                  logger.log(`Optimization skipped for ${path}, with size='${file.size}, a better version was downloaded meanwhile.`);
                } else {
                  logger.log(`Successfuly optimized ${path}`);
                }
                finished();
              }
            );
          } else {
            finished();
          }
        } else {
          console.error(
            `Failed to start to optim ${path}. Size should be ${file.size} (` +
              (error
                ? `file was probably deleted, here the error: ${error}`
                : stats ? stats.size : 'No stats information') +
              ')'
          );
          finished();
        }
      });
    } else {
      finished();
    }
  }, cpuCount * 2);

  /* Setting up the downloading queue */
  const downloadFileQueue = async.queue(function(url, finished) {
    if (url) {
      downloadFileAndCache(url, finished);
    } else {
      finished();
    }
  }, speed * 5);

  /************************************/
  /* FUNCTIONS ************************/
  /************************************/

  function closeAgents(finished) {
    http.globalAgent.destroy();
    https.globalAgent.destroy();
    if (finished) {
      finished();
    }
  }

  function saveStaticFiles(finished) {
    config.output.cssResources.forEach(function(css) {
      try {
        fs.readFile(pathParser.resolve(__dirname, '../' + css + '.css'), (err, data) =>
          fs.writeFile(pathParser.resolve(env.htmlRootPath, cssPath(css)), data, () => {})
        );
      } catch (error) {
        console.error(`Could not create ${css} file : ${error}`);
      }
    });
    finished();
  }

  function randomString(len) {
    let str = '';
    const charSet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < len; i++) {
      const randomPoz = Math.floor(Math.random() * charSet.length);
      str += charSet.substring(randomPoz, randomPoz + 1);
    }
    return str;
  }

  function extractTargetIdFromHref(href) {
    try {
      const pathname = urlParser.parse(href, false, true).pathname || '';
      if (pathname.indexOf('./') === 0) {
        return U.decodeURIComponent(pathname.substr(2));
      } else if (pathname.indexOf(webUrlPath) === 0) {
        return U.decodeURIComponent(pathname.substr(webUrlPath.length));
      }
    } catch (error) {
      console.error(`Unable to parse href ${href}`);
      return '';
    }
  }

  function endProcess(finished) {
    logger.log('Dumping finished with success.');
    redisClient.del(redisMediaIdsDatabase, finished);
  }

  function drainDownloadFileQueue(finished) {
    logger.log(`${downloadFileQueue.length()} images still to be downloaded.`);
    async.doWhilst(
      function(finished) {
        if (downloadFileQueue.idle()) {
          logger.log('Process still downloading images...');
        }
        setTimeout(finished, 1000);
      },
      function() {
        return !downloadFileQueue.idle();
      },
      function(error) {
        const drainBackup = downloadFileQueue.drain;
        downloadFileQueue.drain = function(error) {
          if (error) {
            console.error(`Error by downloading images ${error}`);
            process.exit(1);
          } else {
            if (downloadFileQueue.length() === 0) {
              logger.log('All images successfuly downloaded');
              downloadFileQueue.drain = drainBackup;
              finished();
            }
          }
        };
        downloadFileQueue.push('');
      }
    );
  }

  function drainOptimizationQueue(finished) {
    logger.log(`${optimizationQueue.length()} images still to be optimized.`);
    async.doWhilst(
      function(finished) {
        if (optimizationQueue.idle()) {
          logger.log('Process still being optimizing images...');
        }
        setTimeout(finished, 1000);
      },
      function() {
        return !optimizationQueue.idle();
      },
      function(error) {
        const drainBackup = optimizationQueue.drain;
        optimizationQueue.drain = function(error) {
          if (error) {
            console.error(`Error by optimizing images ${error}`);
            process.exit(1);
          } else {
            if (optimizationQueue.length() === 0) {
              logger.log('All images successfuly optimized');
              optimizationQueue.drain = drainBackup;
              finished();
            }
          }
        };
        optimizationQueue.push({ path: '', size: 0 });
      }
    );
  }

  function cacheRedirects(finished) {
    logger.log('Reset redirects cache file (or create it)');
    fs.openSync(zim.redirectsCacheFile, 'w');

    logger.log('Caching redirects...');
    function cacheRedirect(redirectId, finished) {
      redisClient.hget(redisRedirectsDatabase, redirectId, function(error, target) {
        if (error) {
          console.error(`Unable to get a redirect target from redis for caching: ${error}`);
          process.exit(1);
        } else {
          if (target) {
            logger.log(`Caching redirect ${redirectId} (to ${target})...`);
            var line = `A\t` +
              `${env.getArticleBase(redirectId)}\t` +
              `${redirectId.replace(/_/g, ' ')}\t` +
              `${env.getArticleBase(target, false)}\n`;
            fs.appendFile(zim.redirectsCacheFile, line, finished);
          } else {
            finished();
          }
        }
      });
    }

    redisClient.hkeys(redisRedirectsDatabase, function(error, keys) {
      if (error) {
        console.error(`Unable to get redirect keys from redis for caching: ${error}`);
        process.exit(1);
      } else {
        async.eachLimit(keys, speed, cacheRedirect, function(error) {
          if (error) {
            console.error(`Unable to cache a redirect: ${error}`);
            process.exit(1);
          } else {
            logger.log('All redirects were cached successfuly.');
            finished();
          }
        });
      }
    });
  }

  function saveHtmlRedirects(finished) {
    logger.log('Saving HTML redirects...');

    function saveHtmlRedirect(redirectId, finished) {
      redisClient.hget(redisRedirectsDatabase, redirectId, function(error, target) {
        if (error) {
          console.error(`Unable to get a redirect target from redis for saving: ${error}`);
          process.exit(1);
        } else {
          if (target) {
            logger.log(`Writing HTML redirect ${redirectId} (to ${target})...`);
            const data = redirectTemplate({
              title: redirectId.replace(/_/g, ' '),
              target: env.getArticleUrl(target)
            });
            if (env.deflateTmpHtml) {
              zlib.deflate(data, function(error, deflatedHtml) {
                fs.writeFile(env.getArticlePath(redirectId), deflatedHtml, finished);
              });
            } else {
              fs.writeFile(env.getArticlePath(redirectId), data, finished);
            }
          } else {
            finished();
          }
        }
      });
    }

    redisClient.hkeys(redisRedirectsDatabase, function(error, keys) {
      if (error) {
        console.error(`Unable to get redirect keys from redis for saving: ${error}`);
        process.exit(1);
      } else {
        async.eachLimit(keys, speed, saveHtmlRedirect, function(error) {
          if (error) {
            console.error(`Unable to save a HTML redirect: ${error}`);
            process.exit(1);
          } else {
            logger.log('All redirects were saved successfuly as HTML files.');
            finished();
          }
        });
      }
    });
  }

  function saveArticles(dump, finished) {
    // these vars will store the list of js and css dependencies for the article we are downloading. they are populated in storeDependencies and used in setFooter
    let jsConfigVars = '';
    let jsDependenciesList = [];
    let styleDependenciesList = [];

    function parseHtml(html, articleId, finished) {
      try {
        finished(null, domino.createDocument(html), articleId);
      } catch (error) {
        console.error(`Crash while parsing ${articleId}`);
        console.error(error.stack);
        process.exit(1);
      }
    }

    function storeDependencies(parsoidDoc, articleId, finished) {
      const filenameRadical = env.computeFilenameRadical();

      // the encodeURIComponent below is mandatory for languages with illegal letters for uri (like fa.wikipedia.org)
      // and the encodeURI is mandatory to encode the pipes '|'
      // but the '&' and '=' must not be encoded
      const articleApiUrl = `${apiUrl}action=parse&format=json&page=${encodeURIComponent(articleId)}&prop=${encodeURI('modules|jsconfigvars|headhtml')}`;

      fetch(articleApiUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      })
        .then(response => response.json())
        .then(({ parse: { modules, modulescripts, modulestyles, headhtml } }) => {
          jsDependenciesList = genericJsModules.concat(modules, modulescripts);
          styleDependenciesList = [].concat(modules, modulestyles, genericCssModules);

          styleDependenciesList = styleDependenciesList.filter(
            oneStyleDep => !config.filters.blackListCssModules.includes(oneStyleDep)
          );

          logger.log(`Js dependencies of ${articleId} : ${jsDependenciesList}`);
          logger.log(`Css dependencies of ${articleId} : ${styleDependenciesList}`);

          const allDependenciesWithType = [
            { type: 'js', moduleList: jsDependenciesList },
            { type: 'css', moduleList: styleDependenciesList }
          ];

          allDependenciesWithType.forEach(({ type, moduleList }) =>
            moduleList.forEach(oneModule => downloadAndSaveModule(oneModule, type))
          );

          // Saving, as a js module, the jsconfigvars that are set in the header of a wikipedia page
          // the script below extracts the config with a regex executed on the page header returned from the api
          const scriptTags = domino.createDocument(`${headhtml['*']}</body></html>`).getElementsByTagName('script');
          const regex = /mw\.config\.set\(\{.*?\}\);/mg;
          for (let i = 0; i < scriptTags.length; i++) {
            if (scriptTags[i].text.includes('mw.config.set')) jsConfigVars = regex.exec(scriptTags[i].text);
          }
          jsConfigVars = `(window.RLQ=window.RLQ||[]).push(function() {${jsConfigVars}});`;
          jsConfigVars = jsConfigVars.replace('nosuchaction', 'view'); // to replace the wgAction config that is set to 'nosuchaction' from api but should be 'view'
          try {
            fs.writeFileSync(pathParser.resolve(env.htmlRootPath, jsPath('jsConfigVars')), jsConfigVars);
            logger.log(`created dep jsConfigVars.js for article ${articleId}`);
          } catch (e) {
            console.error(`Error writing file`, e);
          }

          finished(null, parsoidDoc, articleId);
        })
        .catch(e => {
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
        const saveModuleInRedis = (module, moduleUri, type) =>
          new Promise((resolve, reject) => {
            // hsetnx() store in redis only if key doesn't already exists
            redisClient.hsetnx(
              redisModuleDatabase,
              `${dump}_${module}.${type}`,
              moduleUri,
              (err, res) => (err ? reject(`Error, unable to save module ${module} in redis`) : resolve(res))
            );
          });

        // the 2 variable functions below are a hack to call startUp() (from module startup) when the 3 generic dependencies (startup, jquery, mediawiki) are loaded.
        // on wikipedia, startUp() is called in the callback of the call to load.php to dl jquery and mediawiki but since load.php cannot be called in offline,
        // this hack calls startUp() when custom event fireStartUp is received. Which is dispatched when module mediawiki has finished loading
        const hackStartUpModule = jsCode =>
          jsCode.replace(
            "script=document.createElement('script');",
            `
                        document.body.addEventListener('fireStartUp', function () { startUp() }, false);
                        return;
                        script=document.createElement('script');`
          );
        const hackMediaWikiModule = jsCode =>
          jsCode += `
                        (function () {
                            const startUpEvent = new CustomEvent('fireStartUp');
                            document.body.dispatchEvent(startUpEvent);
                        })()`;

        let moduleUri;
        let apiParameterOnly;
        let dirs = config.output.dirs;
        if (type === 'js') {
          moduleUri = pathParser.resolve(env.htmlRootPath, jsPath(module));
          apiParameterOnly = 'scripts';
        } else if (type === 'css') {
          moduleUri = pathParser.resolve(env.htmlRootPath, cssPath(module));
          apiParameterOnly = 'styles';
        }

        const moduleApiUrl = encodeURI(
          `${mw.base}w/load.php?debug=false&lang=en&modules=${module}&only=${apiParameterOnly}&skin=vector&version=&*`
        );
        saveModuleInRedis(module, moduleUri, type)
          .then(redisResult => {
            redisResult === 1 &&
              fetch(moduleApiUrl, {
                method: 'GET',
                headers: { Accept: 'text/plain' }
              })
                .then(response => response.text())
                .then(text => {
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
                .catch(e => console.error(`Error fetching load.php for ${articleId} ${e}`));
          })
          .catch(e => console.error(e));
      };
    }

    function treatMedias(parsoidDoc, articleId, finished) {
      /* Clean/rewrite image tags */
      const imgs = parsoidDoc.getElementsByTagName('img');
      const videos = Array.from(parsoidDoc.getElementsByTagName('video'));
      const srcCache = new Object();

      videos.forEach(videoEl => {
        //Worth noting:
        //Video tags are used for audio files too (as opposed to the audio tag)
        //When it's only audio, there will be a single OGG file
        //For video, we get multiple SOURCE tages with different resolutions

        const posterUrl = videoEl.getAttribute('poster');
        const videoPosterUrl = getFullUrl(posterUrl);
        const newVideoPosterUrl = getMediaUrl(videoPosterUrl);
        let videoSources = Array.from(videoEl.children).filter(child => child.tagName === 'SOURCE');

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

        if (posterUrl) videoEl.setAttribute('poster', newVideoPosterUrl);
        videoEl.removeAttribute('resource');

        if (!srcCache.hasOwnProperty(videoPosterUrl)) {
          srcCache[videoPosterUrl] = true;
          downloadFileQueue.push(videoPosterUrl);
        }

        function byWidthXHeight(a, b) {
          //If there is no width/height, it counts as zero, probably best?
          //Sometimes (pure audio) there will only be one item
          //Sometimes (pure audio) there won't be width/height
          const aWidth = Number(a.getAttribute('data-file-width') || a.getAttribute('data-width') || 0);
          const aHeight = Number(a.getAttribute('data-file-height') || a.getAttribute('data-height') || 0);
          const bWidth = Number(b.getAttribute('data-file-width') || b.getAttribute('data-width') || 0);
          const bHeight = Number(b.getAttribute('data-file-height') || b.getAttribute('data-height') || 0);

          const aVal = aWidth * aHeight;
          const bVal = bWidth * bHeight;
          return aVal > bVal ? 1 : -1;
        }

        videoSources = videoSources.sort(byWidthXHeight);

        const sourcesToRemove = videoSources.slice(1); //All but first

        sourcesToRemove.forEach(DU.deleteNode);

        const sourceEl = videoSources[0]; //Use first source (smallest resolution)
        const sourceUrl = getFullUrl(sourceEl.getAttribute('src'));
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

      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        const imageNodeClass = img.getAttribute('class') || '';

        if (
          (!env.nopic ||
            imageNodeClass.search('mwe-math-fallback-image-inline') >= 0 ||
            img.getAttribute('typeof') === 'mw:Extension/math') &&
          img.getAttribute('src') &&
          img.getAttribute('src').indexOf('./Special:FilePath/') != 0
        ) {
          /* Remove image link */
          const linkNode = img.parentNode;
          if (linkNode.tagName === 'A') {
            /* Check if the target is mirrored */
            let href = linkNode.getAttribute('href') || '';
            const targetId = extractTargetIdFromHref(href);
            const keepLink = targetId && isMirrored(targetId);

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
            const src = getFullUrl(img.getAttribute('src'));
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
      for (let i = 0; i < imageNodes.length; i++) {
        const imageNode = imageNodes[i];
        const image = imageNode.getElementsByTagName('img').length
          ? imageNode.getElementsByTagName('img')[0]
          : imageNode.getElementsByTagName('video').length ? imageNode.getElementsByTagName('video')[0] : undefined;
        const isStillLinked = image && image.parentNode && image.parentNode.tagName === 'A';

        if (!env.nopic && imageNode && image) {
          const imageNodeClass = imageNode.getAttribute('class') || ''; // imageNodeClass already defined
          const imageNodeTypeof = imageNode.getAttribute('typeof') || '';

          if (
            imageNodeTypeof.indexOf('mw:Image/Thumb') >= 0 ||
            imageNodeTypeof.indexOf('mw:Video/Thumb') >= 0 ||
            zim.mobileLayout
          ) {
            const descriptions = imageNode.getElementsByTagName('figcaption');
            const description = descriptions.length > 0 ? descriptions[0] : undefined;
            const imageWidth = parseInt(image.getAttribute('width'));

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
              DU.appendToAttr(thumbDiv, 'class', 't' + revAutoAlign);
            }

            const thumbinnerDiv = parsoidDoc.createElement('div');
            thumbinnerDiv.setAttribute('class', 'thumbinner');
            thumbinnerDiv.setAttribute('style', 'width:' + (imageWidth + 2) + 'px');

            const thumbcaptionDiv = parsoidDoc.createElement('div');
            thumbcaptionDiv.setAttribute('class', 'thumbcaption');
            const autoAlign = env.ltr ? 'left' : 'right';
            thumbcaptionDiv.setAttribute('style', 'text-align: ' + autoAlign);
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

      function rewriteUrl(linkNode, finished) {
        const rel = linkNode.getAttribute('rel');
        let href = linkNode.getAttribute('href') || '';

        if (!href) {
          DU.deleteNode(linkNode);
          setImmediate(function() {
            finished();
          });
        } else if (href.substring(0, 1) === '#') {
          setImmediate(function() {
            finished();
          });
        } else {
          /* Deal with custom geo. URL replacement, for example:
                         * http://maps.wikivoyage-ev.org/w/poimap2.php?lat=44.5044943&lon=34.1969633&zoom=15&layer=M&lang=ru&name=%D0%9C%D0%B0%D1%81%D1%81%D0%B0%D0%BD%D0%B4%D1%80%D0%B0
                         * http://tools.wmflabs.org/geohack/geohack.php?language=fr&pagename=Tour_Eiffel&params=48.85825_N_2.2945_E_type:landmark_region:fr
                         */
          if (rel != 'mw:WikiLink') {
            let lat, lon;
            if (/poimap2\.php/i.test(href)) {
              const hrefQuery = urlParser.parse(href, true).query;
              lat = parseFloat(hrefQuery.lat);
              lon = parseFloat(hrefQuery.lon);
            } else if (/geohack\.php/i.test(href)) {
              let params = urlParser.parse(href, true).query.params;

              /* "params" might be an array, try to detect the geo localization one */
              if (params instanceof Array) {
                let i = 0;
                while (params[i] && isNaN(params[i][0])) {
                  i++;
                }
                params = params[i];
              }

              if (params) {
                // see https://bitbucket.org/magnusmanske/geohack/src public_html geo_param.php
                const pieces = params.toUpperCase().split('_');
                const semiPieces = pieces.length > 0 ? pieces[0].split(';') : undefined;
                if (semiPieces && semiPieces.length === 2) {
                  lat = semiPieces[0];
                  lon = semiPieces[1];
                } else {
                  const factors = [1, 60, 3600];
                  let offs = 0;

                  const deg = function(hemiHash) {
                    let out = 0;
                    let hemiSign = 0;
                    for (let i = 0; i < 4 && i + offs < pieces.length; i++) {
                      const v = pieces[i + offs];
                      hemiSign = hemiHash[v];
                      if (hemiSign) {
                        offs = i + 1;
                        break;
                      }
                      out += v / factors[i];
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
              href = 'geo:' + lat + ',' + lon;
              linkNode.setAttribute('href', href);
            }
          }

          if (rel) {
            /* Add 'external' class to external links */
            if (rel.substring(0, 10) === 'mw:ExtLink' || rel === 'mw:WikiLink/Interwiki') {
              DU.appendToAttr(linkNode, 'class', 'external');
            }

            /* Check if the link is "valid" */
            if (!href) {
              console.error(`No href attribute in the following code, in article ${articleId}`);
              console.error(linkNode.outerHTML);
              process.exit(1);
            }

            /* Rewrite external links starting with // */
            if (rel.substring(0, 10) === 'mw:ExtLink' || rel === 'nofollow') {
              if (href.substring(0, 1) === '/') {
                linkNode.setAttribute('href', getFullUrl(href));
              } else if (href.substring(0, 2) === './') {
                while (linkNode.firstChild) {
                  linkNode.parentNode.insertBefore(linkNode.firstChild, linkNode);
                }
                linkNode.parentNode.removeChild(linkNode);
              }
              setImmediate(function() {
                finished();
              });
            } else if (rel === 'mw:WikiLink' || rel === 'mw:referencedBy') {

              /* Remove internal links pointing to no mirrored articles */
              let targetId = extractTargetIdFromHref(href);

              /* Deal with local anchor */
              let localAnchor = href.lastIndexOf('#') == -1 ? '' : href.substr(href.lastIndexOf('#'));

              if (isMirrored(targetId)) {
                linkNode.setAttribute('href', env.getArticleUrl(targetId) + localAnchor);
                setImmediate(function() {
                  finished();
                });
              } else {
                try {
                  redisClient.hexists(redisRedirectsDatabase, targetId, function(error, res) {
                    if (error) {
                      console.error(`Unable to check redirect existence with redis: ${error}`);
                      process.exit(1);
                    } else {
                      if (res) {
                        linkNode.setAttribute('href', env.getArticleUrl(targetId));
                      } else {
                        while (linkNode.firstChild) {
                          linkNode.parentNode.insertBefore(linkNode.firstChild, linkNode);
                        }
                        linkNode.parentNode.removeChild(linkNode);
                      }
                    }
                    setImmediate(function() {
                      finished();
                    });
                  });
                } catch (error) {
                  console.error(`Exception by requesting redis ${error}`);
                  process.exit(1);
                }
              }
            } else {
              setImmediate(function() {
                finished();
              });
            }
          } else {
            const targetId = extractTargetIdFromHref(href); // targetId already defined

            /* Deal with local anchor */
            let localAnchor = href.lastIndexOf('#') == -1 ? '' : href.substr(href.lastIndexOf('#'));

            if (targetId) {
              if (isMirrored(targetId)) {
                linkNode.setAttribute('href', env.getArticleUrl(targetId) + localAnchor);
                setImmediate(function() {
                  finished();
                });
              } else {
                redisClient.hexists(redisRedirectsDatabase, targetId, function(error, res) {
                  if (error) {
                    console.error(`Unable to check redirect existence with redis: ${error}`);
                    process.exit(1);
                  } else {
                    if (res) {
                      linkNode.setAttribute('href', env.getArticleUrl(targetId));
                    } else {
                      while (linkNode.firstChild) {
                        linkNode.parentNode.insertBefore(linkNode.firstChild, linkNode);
                      }
                      linkNode.parentNode.removeChild(linkNode);
                    }
                  }
                  setImmediate(function() {
                    finished();
                  });
                });
              }
            } else {
              setImmediate(function() {
                finished();
              });
            }
          }
        }
      }

      async.eachLimit(linkNodes, speed, rewriteUrl, function(error) {
        if (error) {
          console.error(`Problem by rewriting urls: ${error}`);
          process.exit(1);
        } else {
          finished(null, parsoidDoc, articleId);
        }
      });
    }

    function applyOtherTreatments(parsoidDoc, articleId, finished) {
      const filtersConfig = config.filters;

      /* Don't need <link> and <input> tags */
      const nodesToDelete = [{ tag: 'link' }, { tag: 'input' }];

      /* Remove "map" tags if necessary */
      if (env.nopic) {
        nodesToDelete.push({ tag: 'map' });
      }

      /* Remove useless DOM nodes without children */
      const emptyChildFilter = function(n) {
        return !n.innerHTML;
      };
      nodesToDelete.push({ tag: 'li', filter: emptyChildFilter });
      nodesToDelete.push({ tag: 'span', filter: emptyChildFilter });

      /* Remove gallery boxes if pics need stripping of if it doesn't have thumbs */
      nodesToDelete.push({
        class: 'gallerybox',
        filter: function(n) {
            return !n.getElementsByTagName('img').length &&
                   !n.getElementsByTagName('audio').length &&
                   !n.getElementsByTagName('video').length;
        }
      });
      nodesToDelete.push({
        class: 'gallery',
        filter: function(n) {
            return !n.getElementsByClassName('gallerybox').length;
        }
      });

      /* Remove element with black listed CSS classes */
      filtersConfig.cssClassBlackList.map(function(classname) {
        nodesToDelete.push({ class: classname });
      });

      if (env.nodet) {
        filtersConfig.nodetCssClassBlackList.map(function(classname) {
          nodesToDelete.push({ class: classname });
        });
      }

      /* Remove element with black listed CSS classes and no link */
      filtersConfig.cssClassBlackListIfNoLink.map(function(classname) {
        nodesToDelete.push({
          class: classname,
          filter: function(n) {
            return n.getElementsByTagName('a').length === 0;
          }
        });
      });

      /* Delete them all */
      nodesToDelete.map(function(t) {
        let nodes;
        if (t.tag) {
          nodes = parsoidDoc.getElementsByTagName(t.tag);
        } else if (t.class) {
          nodes = parsoidDoc.getElementsByClassName(t.class);
        } else {
          return; /* throw error? */
        }

        const f = t.filter;
        for (let i = 0; i < nodes.length; i++) {
          if (!f || f(nodes[i])) {
            DU.deleteNode(nodes[i]);
          }
        }
      });

      /* Go through all reference calls */
      const spans = parsoidDoc.getElementsByTagName('span');
      for (let i = 0; i < spans.length; i++) {
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
      filtersConfig.idBlackList.map(function(id) {
        const node = parsoidDoc.getElementById(id);
        if (node) {
          DU.deleteNode(node);
        }
      });

      /* Force display of element with that CSS class */
      filtersConfig.cssClassDisplayList.map(function(classname) {
        const nodes = parsoidDoc.getElementsByClassName(classname);
        for (let i = 0; i < nodes.length; i++) {
          nodes[i].style.removeProperty('display');
        }
      });

      /* Remove empty paragraphs */
      if (!keepEmptyParagraphs) {
        for (let level = 5; level > 0; level--) {
          const paragraphNodes = parsoidDoc.getElementsByTagName('h' + level);
          for (let i = 0; i < paragraphNodes.length; i++) {
            const paragraphNode = paragraphNodes[i];
            const nextElementNode = DU.nextElementSibling(paragraphNode);

            /* No nodes */
            if (!nextElementNode) {
              DU.deleteNode(paragraphNode);
            } else {
              /* Delete if nextElementNode is a paragraph with <= level */
              const nextElementNodeTag = nextElementNode.tagName.toLowerCase();
              if (
                nextElementNodeTag.length > 1 &&
                nextElementNodeTag[0] === 'h' &&
                !isNaN(nextElementNodeTag[1]) &&
                nextElementNodeTag[1] <= level
              ) {
                DU.deleteNode(paragraphNode);
              }
            }
          }
        }
      }

      /* Clean the DOM of all uncessary code */
      const allNodes = parsoidDoc.getElementsByTagName('*');
      for (let i = 0; i < allNodes.length; i++) {
        const node = allNodes[i];
        node.removeAttribute('data-parsoid');
        node.removeAttribute('typeof');
        node.removeAttribute('about');
        node.removeAttribute('data-mw');

        if (node.getAttribute('rel') && node.getAttribute('rel').substr(0, 3) === 'mw:') {
          node.removeAttribute('rel');
        }

        /* Remove a few css calls */
        filtersConfig.cssClassCallsBlackList.map(function(classname) {
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
              ? jsDependenciesList.map(oneJsDep => genHeaderScript(oneJsDep)).join('\n')
              : ''
          )
          .replace(
            '__ARTICLE_CSS_LIST__',
            styleDependenciesList.length !== 0
              ? styleDependenciesList.map(oneCssDep => genHeaderCSSLink(oneCssDep)).join('\n')
              : ''
          )
      );

      /* Create final document by merging template and parsoid documents */
      htmlTemplateDoc.getElementById('mw-content-text').innerHTML = parsoidDoc.getElementsByTagName('body')[
        0
      ].innerHTML;

      /* Title */
      if (zim.mobileLayout) {
        htmlTemplateDoc.getElementsByTagName('title')[0].innerHTML = htmlTemplateDoc.getElementById('title_0')
          ? htmlTemplateDoc.getElementById('title_0').innerHTML
          : articleId.replace(/_/g, ' ');
        DU.deleteNode(htmlTemplateDoc.getElementById('titleHeading'));
      } else {
        htmlTemplateDoc.getElementsByTagName('title')[0].innerHTML = parsoidDoc.getElementsByTagName('title')
          ? parsoidDoc.getElementsByTagName('title')[0].innerHTML.replace(/_/g, ' ')
          : articleId.replace(/_/g, ' ');
        if (zim.mainPageId != articleId) {
          htmlTemplateDoc.getElementById('titleHeading').innerHTML = htmlTemplateDoc.getElementsByTagName('title')[
            0
          ].innerHTML;
        } else {
          DU.deleteNode(htmlTemplateDoc.getElementById('titleHeading'));
        }
      }

      /* Subpage */
      if (isSubpage(articleId) && zim.mainPageId != articleId) {
        const headingNode = htmlTemplateDoc.getElementById('mw-content-text');
        const subpagesNode = htmlTemplateDoc.createElement('span');
        const parents = articleId.split('/');
        parents.pop();
        let subpages = '';
        let parentPath = '';
        parents.map(function(parent) {
          const label = parent.replace(/_/g, ' ');
          const isParentMirrored = isMirrored(parentPath + parent);
          subpages +=
            '&lt; ' +
            (isParentMirrored
              ? '<a href="' + env.getArticleUrl(parentPath + parent) + '" title="' + label + '">'
              : '') +
            label +
            (isParentMirrored ? '</a> ' : ' ');
          parentPath += parent + '/';
        });
        subpagesNode.innerHTML = subpages;
        subpagesNode.setAttribute('class', 'subpages');
        headingNode.parentNode.insertBefore(subpagesNode, headingNode);
      }

      /* Set footer */
      const div = htmlTemplateDoc.createElement('div');
      const oldId = articleIds[articleId];
      redisClient.hget(redisArticleDetailsDatabase, articleId, function(error, detailsJson) {
        if (error) {
          finished(`Unable to get the details from redis for article ${articleId}: ${error}`);
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
            oldId: oldId,
            date: date.toISOString().substring(0, 10)
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
          minifyCSS: true
        });
      }

      if (env.deflateTmpHtml) {
        zlib.deflate(html, function(error, deflatedHtml) {
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
          headers: { Accept: 'application/json' }
        })
          .then(response => response.json())
          .then(json => {
            // set the first section (open by default)
            html += `
                            <h1
                                class="section-heading in-block collapsible-heading open-block" tabindex="0" aria-haspopup="true" aria-controls="content-collapsible-block-0"
                                onClick="toggleOpenSection(0)"
                            >
                                <div class="mw-ui-icon mw-ui-icon-arrow mw-ui-icon-element  indicator" title=""></div>
                                <span class="mw-headline" id="title_0">${json.lead.displaytitle}</span>
                            </h1>
                            <div id="mf-section-0" class="mf-section-0 collapsible-block open-block" id="content-collapsible-block-0" aria-pressed="true" aria-expanded="true">
                                ${json.lead.sections[0].text}
                            </div>`;

            // set all other section (closed by default)
            if (!env.nodet) {
              json.remaining.sections.forEach((oneSection, i) => {
                // if below is to test if we need to nest a subsections into a section
                if (oneSection.toclevel === 1) {
                  html = html.replace(`__SUB_LEVEL_SECTION_${oneSection.id - 1}__`, ''); // remove unused anchor for subsection
                  html += `
                                            <h2
                                        class="section-heading in-block collapsible-heading" tabindex="0" aria-haspopup="true" aria-controls="content-collapsible-block-${i + 1}"
                                        onClick="toggleOpenSection(${oneSection.id})"
                                            >
                                            <div class="mw-ui-icon mw-ui-icon-arrow mw-ui-icon-element  indicator" title=""></div>
                                            <span class="mw-headline" id="${oneSection.anchor}">${oneSection.line}</span>
                                            </h2>
                                            <div id="mf-section-${oneSection.id}" class="mf-section-${oneSection.id} collapsible-block" id="content-collapsible-block-0" aria-pressed="true" aria-expanded="true">
                                            ${oneSection.text}
                                        __SUB_LEVEL_SECTION_${oneSection.id}__
                                        </div>`;
                } else {
                  html = html.replace(
                    `__SUB_LEVEL_SECTION_${oneSection.id - 1}__`,
                    `
                                                            <h${oneSection.toclevel + 1}
                                                            class="section-heading in-block collapsible-heading open-block" tabindex="0" aria-haspopup="true" aria-controls="content-collapsible-block-${i + 1}"
                                                            >
                                                            <span class="mw-headline" id="${oneSection.anchor}">${oneSection.line}</span>
                                                            </h${oneSection.toclevel + 1}>
                                                            <div id="mf-section-${oneSection.id}" class="mf-section-${oneSection.id} collapsible-block open-block" id="content-collapsible-block-0" aria-pressed="true" aria-expanded="true">
                                                            ${oneSection.text}
                                                            </div>
                                                            __SUB_LEVEL_SECTION_${oneSection.id}__
                                                            `
                  );
                }
              });
            }

            html = html.replace(`__SUB_LEVEL_SECTION_${json.remaining.sections.length}__`, ''); // remove the last subcestion anchor (all other anchor are removed in the forEach)
            buildArticleFromApiData();
          })
          .catch(e => {
            console.error(`Error handling json response from api. ${e}`);
            buildArticleFromApiData();
          });
      } else {
        const articleUrl =
          parsoidUrl +
          encodeURIComponent(articleId) +
          (parsoidUrl.indexOf('/rest') < 0 ? (parsoidUrl.indexOf('?') < 0 ? '?' : '&') + 'oldid=' : '/') +
          articleIds[articleId];
        logger.log(`Getting (desktop) article from ${articleUrl}`);
        setTimeout(
          skipHtmlCache || articleId === zim.mainPageId
            ? downloader.downloadContent.bind(downloader)
            : downloadContentAndCache,
          downloadFileQueue.length() + optimizationQueue.length(),
          articleUrl,
          function(content, responseHeaders, articleId) {
            let json;
            if (parsoidContentType === 'json') {
              try {
                json = JSON.parse(content.toString());
              } catch (e) {
                //TODO: Figure out why this is happening
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
          articleId
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
            parseHtml
          );

          logger.log(`Treating and saving article ${articleId} at ${articlePath}...`);
          prepareAndSaveArticle(html, articleId, function(error, result) {
            if (error) {
              console.error(`Error by preparing and saving file ${error}`);
              process.exit(1);
            } else {
              logger.log(`Dumped successfully article ${articleId}`);
              finished();
            }
          });
        } else {
          delete articleIds[articleId];
          finished();
        }
      }
    }

    logger.log('Saving articles...');
    async.eachLimit(Object.keys(articleIds), speed, saveArticle, function(error) {
      if (error) {
        console.error(`Unable to retrieve an article correctly: ${error}`);
        process.exit(1);
      } else {
        logger.log('All articles were retrieved and saved.');
        finished();
      }
    });
  }

  function addNoIndexCommentToElement(element) {
    const slices = element.parentElement.innerHTML.split(element.outerHTML);
    element.parentElement.innerHTML = `${slices[0]}<!--htdig_noindex-->${element.outerHTML}<!--/htdig_noindex-->${slices[1]}`;
  }

  function isMirrored(id) {
    if (!zim.articleList && id && id.indexOf(':') >= 0) {
      const namespace = mw.namespaces[id.substring(0, id.indexOf(':')).replace(/ /g, mw.spaceDelimiter)];
      if (namespace != undefined) {
        return namespace.isContent;
      }
    }
    return id in articleIds;
  }

  function isSubpage(id) {
    if (id && id.indexOf('/') >= 0) {
      let namespace = id.indexOf(':') >= 0 ? id.substring(0, id.indexOf(':')).replace(/ /g, mw.spaceDelimiter) : '';
      namespace = mw.namespaces[namespace]; // namespace already defined
      if (namespace != undefined) {
        return namespace.allowedSubpages;
      }
    }
    return false;
  }

  /* Grab and concatenate stylesheet files */
  function saveStylesheet(finished) {
    logger.log('Dumping stylesheets...');
    const urlCache = new Object();
    const stylePath = `${env.htmlRootPath}${dirs.style}/style.css`;

    /* Remove if exists */
    fs.unlink(stylePath, function() {});

    /* Take care to download medias */
    const downloadCSSFileQueue = async.queue(function(data, finished) {
      if (data.url && data.path) {
        downloadFile(data.url, data.path, true, finished);
      } else {
        finished();
      }
    }, speed);

    /* Take care to download CSS files */
    const downloadCSSQueue = async.queue(function(link, finished) {
      /* link might be a 'link' DOM node or an URL */
      const cssUrl = typeof link === 'object' ? getFullUrl(link.getAttribute('href')) : link;
      const linkMedia = typeof link === 'object' ? link.getAttribute('media') : null;

      if (cssUrl) {
        const cssUrlRegexp = new RegExp('url\\([\'"]{0,1}(.+?)[\'"]{0,1}\\)', 'gi');
        const cssDataUrlRegex = new RegExp('^data');

        logger.log(`Downloading CSS from ${decodeURI(cssUrl)}`);
        downloader.downloadContent(cssUrl, function(content, responseHeaders) {
          const body = content.toString();

          let rewrittenCss = `\n/* start ${cssUrl} */\n\n`;
          rewrittenCss += linkMedia ? `@media ${linkMedia}  {\n` : '\n';
          rewrittenCss += `${body}\n`;
          rewrittenCss += linkMedia ? `} /* @media ${linkMedia} */\n` : '\n';
          rewrittenCss += `\n/* end   ${cssUrl} */\n`;

          /* Downloading CSS dependencies */
          let match;
          while ((match = cssUrlRegexp.exec(body))) {
            let url = match[1];

            /* Avoid 'data', so no url dependency */
            if (!url.match('^data')) {
              let filename = pathParser.basename(urlParser.parse(url, false, true).pathname);

              /* Rewrite the CSS */
              rewrittenCss = rewrittenCss.replace(url, filename);

              /* Need a rewrite if url doesn't include protocol */
              url = getFullUrl(url, cssUrl);
              url = url.indexOf('%') < 0 ? encodeURI(url) : url;

              /* Download CSS dependency, but avoid duplicate calls */
              if (!urlCache.hasOwnProperty(url) && filename) {
                urlCache[url] = true;
                downloadCSSFileQueue.push({ url: url, path: env.htmlRootPath + dirs.style + '/' + filename });
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
    downloadContentAndCache(mw.webUrl, function(content, responseHeaders) {
      let html = content.toString();
      const doc = domino.createDocument(html);
      const links = doc.getElementsByTagName('link');

      /* Go through all CSS links */
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        if (link.getAttribute('rel') === 'stylesheet') {
          downloadCSSQueue.push(link);
        }
      }

      /* Push Mediawiki:Offline.css ( at the end) */
      downloadCSSQueue.push(`${mw.webUrl}Mediawiki:offline.css?action=raw`);

      /* Set the drain method to be called one time everything is done */
      downloadCSSQueue.drain = function(error) {
        if (error) {
          console.error(`Error by CSS dependencies: ${error}`);
          process.exit(1);
        } else {
          const drainBackup = downloadCSSQueue.drain;
          downloadCSSFileQueue.drain = function(error) {
            if (error) {
              console.error(`Error by CSS medias: ${error}`);
              process.exit(1);
            } else {
              downloadCSSQueue.drain = drainBackup;
              finished();
            }
          };
          downloadCSSFileQueue.push('');
        }
      };
      downloadCSSQueue.push('');
    });
  }

  /* Get ids */
  const redirectQueue = async.queue(function(articleId, finished) {
    if (articleId) {
      logger.log(`Getting redirects for article ${articleId}...`);
      let url = `${apiUrl}action=query&list=backlinks&blfilterredir=redirects&bllimit=max&format=json&bltitle=${encodeURIComponent(articleId)}&rawcontinue=`;
      downloader.downloadContent(url, function(content, responseHeaders) {
        const body = content.toString();
        try {
          if (!JSON.parse(body).error) {
            const redirects = new Object();
            let redirectsCount = 0;
            JSON.parse(body).query.backlinks.map(function(entry) {
              const title = entry.title.replace(/ /g, mw.spaceDelimiter);
              redirects[title] = articleId;
              redirectsCount++;

              if (title === zim.mainPageId) {
                zim.mainPageId = articleId;
              }
            });
            logger.log(`${redirectsCount} redirect(s) found for ${articleId}`);
            if (redirectsCount) {
              redisClient.hmset(redisRedirectsDatabase, redirects, function(error) {
                if (error) {
                  console.error(`Unable to set redirects: ${error}`);
                  process.exit(1);
                } else {
                  finished();
                }
              });
            } else {
              finished();
            }
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

  function getArticleIds(finished) {
    function drainRedirectQueue(finished) {
      redirectQueue.drain = function(error) {
        if (error) {
          console.error(`Unable to retrieve redirects for an article: ${error}`);
          process.exit(1);
        } else {
          logger.log('All redirect ids retrieve successfuly.');
          finished();
        }
      };
      redirectQueue.push('');
    }

    /* Parse article list given by API */
    function parseJson(body) {
      let next = '';
      const json = JSON.parse(body);
      const entries = json.query && json.query.pages;

      if (entries) {
        const redirectQueueValues = new Array();
        const details = new Object();
        Object.keys(entries).map(function(key) {
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
              const articleDetails = { t: parseInt(new Date(entry.revisions[0].timestamp).getTime() / 1000) };

              /* Get article geo coordinates */
              if (entry.coordinates) {
                articleDetails.g = entry.coordinates[0].lat + ';' + entry.coordinates[0].lon;
              }

              /* Save as JSON string */
              details[entry.title] = JSON.stringify(articleDetails);
            } else if (entry.pageid) {
              logger.log(`Unable to get revisions for ${entry.title}, but entry exists in the database. Article was probably deleted meanwhile.`);
              delete articleIds[entry.title];
            } else {
              console.error(`Unable to get revisions for ${entry.title}`);
              console.error(`JSON was ${body}`);
              process.exit(1);
            }
          }
        });

        if (redirectQueueValues.length) redirectQueue.push(redirectQueueValues);
        if (Object.keys(details).length) {
          redisClient.hmset(redisArticleDetailsDatabase, details, function(error) {
            if (error) {
              console.error(`Unable to save article detail information to redis: ${error}`);
              process.exit(1);
            }
          });
        }
      }

      /* Get continue parameters from 'query-continue',
                 * unfortunately old MW version does not use the same way
                 * than recent */
      const continueHash = json['query-continue'] && json['query-continue'].allpages;
      if (continueHash) {
        for (const key in continueHash) {
          next += '&' + key + '=' + encodeURIComponent(continueHash[key]);
        }
      }

      return next;
    }

    /* Get ids from file */
    function getArticleIdsForLine(line, finished) {
      if (line) {
        const title = line.replace(/ /g, mw.spaceDelimiter).replace('\r', '');

        let url = `${apiUrl}action=query&redirects&format=json&prop=revisions|coordinates&titles=${encodeURIComponent(title)}`;
        const f = downloader.downloadContent.bind(downloader);
        setTimeout(f, redirectQueue.length() > 30000 ? redirectQueue.length() - 30000 : 0, url, function(
          content,
          responseHeaders
        ) {
          const body = content.toString();
          if (body && body.length > 1) {
            parseJson(body);
          }
          setTimeout(finished, redirectQueue.length());
        });
      } else {
        finished();
      }
    }

    function getArticleIdsForFile(finished) {
      var lines;
      try {
        lines = fs.readFileSync(zim.articleList).toString().split('\n');
      } catch (error) {
        console.error(`Unable to open article list file: ${error}`);
        process.exit(1);
      }

      async.eachLimit(lines, speed, getArticleIdsForLine, function(error) {
        if (error) {
          console.error(`Unable to get all article ids for a file: ${error}`);
          process.exit(1);
        } else {
          logger.log('List of article ids to mirror completed');
          drainRedirectQueue(finished);
        }
      });
    }

    /* Get ids from Mediawiki API */
    function getArticleIdsForNamespace(namespace, finished) {
      let next = '';

      async.doWhilst(
        function(finished) {
          logger.log(
            `Getting article ids for namespace "${namespace}" ` +
              (next != '' ? ' (from ' + (namespace ? namespace + ':' : '') + next.split('=')[1] + ')' : '') +
              '...'
          );
          let url = `${apiUrl}action=query&generator=allpages&gapfilterredir=nonredirects&gaplimit=max&colimit=max&prop=revisions|coordinates&gapnamespace=${mw.namespaces[namespace].number}&format=json&rawcontinue=${next}`;
          const dc = downloader.downloadContent.bind(downloader);
          setTimeout(dc, redirectQueue.length() > 30000 ? redirectQueue.length() - 30000 : 0, url, function(
            content,
            responseHeaders
          ) {
            const body = content.toString();
            if (body && body.length > 1) {
              next = parseJson(body);
              finished();
            } else {
              next = '';
              finished(`Error by retrieving ${url}`);
            }
          });
        },
        function() {
          return next;
        },
        function(error) {
          if (error) {
            console.error(`Unable to download article ids: ${error}`);
            process.exit(1);
          } else {
            logger.log(`List of article ids to mirror completed for namespace "${namespace}"`);
            finished();
          }
        }
      );
    }

    function getArticleIdsForNamespaces() {
      async.eachLimit(mw.namespacesToMirror, mw.namespacesToMirror.length, getArticleIdsForNamespace, function(error) {
        if (error) {
          console.error(`Unable to get all article ids for in a namespace: ${error}`);
          process.exit(1);
        } else {
          logger.log('All articles ids (but without redirect ids) for all namespaces were successfuly retrieved.');
          drainRedirectQueue(finished);
        }
      });
    }

    /* Get list of article ids */
    async.series(
      [
        function(finished) {
          getArticleIdsForLine(zim.mainPageId, finished);
        },
        function(finished) {
          if (zim.articleList) {
            getArticleIdsForFile(finished);
          } else {
            getArticleIdsForNamespaces(finished);
          }
        },
        function(finished) {
          if (zim.articleList) {
            finished();
          } else {
            if (!isMirrored(zim.mainPageId)) {
              getArticleIdsForLine(zim.mainPageId, finished);
            } else {
              finished();
            }
          }
        }
      ],
      function(error) {
        if (error) {
          console.error(`Unable retrive article ids: ${error}`);
          process.exit(1);
        } else {
          finished();
        }
      }
    );
  }

  /* Create directories for static files */
  function createSubDirectories(finished) {
    logger.log(`Creating sub directories at "${env.htmlRootPath}"...`);
    async.series(
      [
        function(finished) {
          exec(`rm -rf "${env.htmlRootPath}"`, finished);
        },
        function(finished) {
          fs.mkdir(env.htmlRootPath, undefined, finished);
        },
        function(finished) {
          fs.mkdir(env.htmlRootPath + dirs.style, undefined, finished);
        },
        function(finished) {
          fs.mkdir(env.htmlRootPath + dirs.style + '/' + dirs.styleModules, undefined, finished);
        },
        function(finished) {
          fs.mkdir(env.htmlRootPath + dirs.media, undefined, finished);
        },
        function(finished) {
          fs.mkdir(env.htmlRootPath + dirs.javascript, undefined, finished);
        },
        function(finished) {
          fs.mkdir(env.htmlRootPath + dirs.javascript + '/' + dirs.jsModules, undefined, finished);
        }
      ],
      function(error) {
        if (error) {
          console.error(`Unable to create mandatory directories : ${error}`);
          process.exit(1);
        } else {
          finished();
        }
      }
    );
  }

  /* Multiple developer friendly functions */
  function getFullUrl(url, baseUrl) {
    const urlObject = urlParser.parse(url, false, true);

    if (!urlObject.protocol) {
      const baseUrlObject = baseUrl ? urlParser.parse(baseUrl, false, true) : {};
      urlObject.protocol = urlObject.protocol || baseUrlObject.protocol || 'http:';
      urlObject.host = urlObject.host || baseUrlObject.host || webUrlHost;

      /* Relative path */
      if (urlObject.pathname && urlObject.pathname.indexOf('/') != 0 && baseUrlObject.pathname) {
        urlObject.pathname = `${pathParser.dirname(baseUrlObject.pathname)}/${urlObject.pathname}`;
      }

      url = urlParser.format(urlObject);
    }

    return url;
  }

  function downloadContentAndCache(url, callback, var1, var2, var3) {
    const cachePath = zim.cacheDirectory + crypto.createHash('sha1').update(url).digest('hex').substr(0, 20);
    const cacheHeadersPath = `${cachePath}.h`;

    async.series(
      [
        function(finished) {
          fs.readFile(cachePath, function(error, data) {
            finished(error, error ? undefined : data.toString());
          });
        },
        function(finished) {
          fs.readFile(cacheHeadersPath, function(error, data) {
            try {
              finished(error, error ? undefined : JSON.parse(data.toString()));
            } catch (error) {
              finished(`Error in downloadContentAndCache() JSON parsing of ${cacheHeadersPath}, error is: ${error}`);
            }
          });
        }
      ],
      function(error, results) {
        if (error) {
          downloader.downloadContent(url, function(content, responseHeaders) {
            logger.log(`Caching ${url} at ${cachePath}...`);
            fs.writeFile(cacheHeadersPath, JSON.stringify(responseHeaders), function(error) {
              fs.writeFile(cachePath, content, function(error) {
                callback(content, responseHeaders, var1, var2, var3);
              });
            });
          });
        } else {
          logger.log(`Cache hit for ${url} (${cachePath})`);
          U.touch(cachePath, cacheHeadersPath);
          callback(results[0], results[1], var1, var2, var3);
        }
      }
    );
  }

  function downloadFileAndCache(url, callback) {
    const parts = mediaRegex.exec(decodeURI(url));
    const filenameBase = parts[2].length > parts[5].length
      ? parts[2]
      : parts[5] + (parts[6] || '.svg') + (parts[7] || '');
    const width = parseInt(parts[4].replace(/px\-/g, '')) || INFINITY_WIDTH;

    /* Check if we have already met this image during this dumping process */
    redisClient.hget(redisMediaIdsDatabase, filenameBase, function(error, r_width) {
      /* If no redis entry */
      if (error || !r_width || r_width < width) {
        /* Set the redis entry if necessary */
        redisClient.hset(redisMediaIdsDatabase, filenameBase, width, function(error) {
          if (error) {
            console.error(`Unable to set redis entry for file to download ${filenameBase}: ${error}`);
            process.exit(1);
          } else {
            const mediaPath = getMediaPath(url);
            const cachePath =
              zim.cacheDirectory +
              'm/' +
              crypto.createHash('sha1').update(filenameBase).digest('hex').substr(0, 20) +
              (pathParser.extname(urlParser.parse(url, false, true).pathname || '') || '');
            const cacheHeadersPath = cachePath + '.h';
            let toDownload = false;

            /* Check if the file exists in the cache */
            if (fs.existsSync(cacheHeadersPath) && fs.existsSync(cachePath)) {
              let responseHeaders;
              try {
                responseHeaders = JSON.parse(fs.readFileSync(cacheHeadersPath).toString());
              } catch (error) {
                console.error(`Error in downloadFileAndCache() JSON parsing of ${cacheHeadersPath}, error is: ${error}`);
                responseHeaders = undefined;
              }

              /* If the cache file width higher than needed, use it. Otherwise download it and erase the cache */
              if (!responseHeaders || responseHeaders.width < width) {
                toDownload = true;
              } else {
                fs.symlink(cachePath, mediaPath, 'file', function(error) {
                  if (error) {
                    if (error.code != 'EEXIST') {
                      console.error(`Unable to create symlink to ${mediaPath} at ${cachePath}: ${error}`);
                      process.exit(1);
                    } else if (!skipCacheCleaning) {
                      U.touch(cachePath);
                    }
                  }

                  if (!skipCacheCleaning) {
                    U.touch(cacheHeadersPath);
                  }
                });
                if (responseHeaders.width === width) {
                  redisClient.hdel(redisCachedMediaToCheckDatabase, filenameBase);
                } else {
                  redisClient.hset(redisCachedMediaToCheckDatabase, filenameBase, width, function(error) {
                    if (error) {
                      console.error(`Unable to set redis cache media to check ${filenameBase}: ${error}`);
                      process.exit(1);
                    }
                  });
                }
                callback();
              }
            } else {
              toDownload = true;
            }

            /* Download the file if necessary */
            if (toDownload) {
              downloadFile(url, cachePath, true, function(error, responseHeaders) {
                if (error) {
                  callback();
                } else {
                  logger.log(`Caching ${filenameBase} at ${cachePath}...`);
                  fs.symlink(cachePath, mediaPath, 'file', function(error) {
                    if (error && error.code != 'EEXIST') {
                      console.error(`Unable to create symlink to ${mediaPath} at ${cachePath}: ${error}`);
                      process.exit(1);
                    }
                    fs.writeFile(cacheHeadersPath, JSON.stringify({ width: width }), function(error) {
                      if (error) {
                        console.error(`Unable to write cache header at ${cacheHeadersPath}: ${error}`);
                        process.exit(1);
                      }
                      callback();
                    });
                  });
                }
              });
            } else {
              logger.log(`Cache hit for ${url}`);
            }
          }
        });
      } else {
        /* We already have this image with a resolution equal or higher to what we need */
        callback();
      }
    });
  }

  function downloadFile(url, path, force, callback) {
    fs.stat(path, function(error, stats) {
      if (error && !force) {
        if (error.code === 'ENOENT') {
          logger.log(`${path} already downloaded, download will be skipped.`);
          callback();
        } else {
          logger.log(`Impossible to stat() ${path}: ${error}`);
          process.exit(1);
        }
      } else {
        logger.log(`Downloading ${decodeURI(url)} at ${path}...`);
        downloader.downloadContent(url, function(content, responseHeaders) {
          fs.writeFile(path, content, function(error) {
            if (error) {
              console.error(`Unable to write ${path} (${url})`);
              process.exit(1);
            } else {
              optimizationQueue.push({ path: path, size: content.length });
            }
            callback(error, responseHeaders);
          });
        });
      }
    });
  }

  /* Internal path/url functions */
  function getMediaUrl(url) {
    return getMediaBase(url, true);
  }

  function getMediaPath(url, escape) {
    const mediaBase = getMediaBase(url, escape);
    return mediaBase ? env.htmlRootPath + mediaBase : undefined;
  }

  function getMediaBase(url, escape) {
    let root;

    const parts = mediaRegex.exec(decodeURI(url));
    if (parts) {
      root = parts[2].length > parts[5].length ? parts[2] : parts[5] + (parts[6] || '.svg') + (parts[7] || '');
    }

    if (!root) {
      console.error(`Unable to parse media url "${url}"`);
      return;
    }

    function e(string) {
      return string === undefined ? undefined : escape ? encodeURIComponent(string) : string;
    }

    const filenameFirstVariant = parts[2];
    const filenameSecondVariant = parts[5] + (parts[6] || '.svg') + (parts[7] || '');
    let filename = U.decodeURIComponent(
      filenameFirstVariant.length > filenameSecondVariant.length ? filenameFirstVariant : filenameSecondVariant
    );

    /* Need to shorten the file due to filesystem limitations */
    if (unicodeCutter.getBinarySize(filename) > 249) {
      const ext = pathParser.extname(filename).split('.')[1] || '';
      const basename = filename.substring(0, filename.length - ext.length - 1) || '';
      filename =
        unicodeCutter.truncateToBinarySize(basename, 239 - ext.length) +
        crypto.createHash('md5').update(basename).digest('hex').substring(0, 2) +
        '.' +
        ext;
    }

    return dirs.media + '/' + e(filename);
  }

  function saveFavicon(finished) {
    logger.log('Saving favicon.png...');
    const faviconPath = env.htmlRootPath + 'favicon.png';

    function resizeFavicon(finished) {
      const cmd = `convert -thumbnail 48 "${faviconPath}" "${faviconPath}.tmp" ; mv "${faviconPath}.tmp" "${faviconPath}" `;
      exec(cmd, function(error, stdout, stderr) {
        fs.stat(faviconPath, function(error, stats) {
          optimizationQueue.push({ path: faviconPath, size: stats.size }, function() {
            finished(error);
          });
        });
      }).on('error', function(error) {
        console.error(error);
      });
    }

    if (customZimFavicon) {
      const content = fs.readFileSync(customZimFavicon);
      fs.writeFileSync(faviconPath, content);
      resizeFavicon(finished);
    } else {
      downloader.downloadContent(`${apiUrl}action=query&meta=siteinfo&format=json`, function(content, responseHeaders) {
        const body = content.toString();
        const entries = JSON.parse(body).query.general;
        let logoUrl = entries.logo;
        logoUrl = urlParser.parse(logoUrl).protocol ? logoUrl : 'http:' + logoUrl;
        downloadFile(logoUrl, faviconPath, true, function() {
          resizeFavicon(finished);
        });
      });
    }
  }

  function getMainPage(finished) {
    function writeMainPage(html, finished) {
      const mainPagePath = env.htmlRootPath + 'index.htm';
      if (env.deflateTmpHtml) {
        zlib.deflate(html, function(error, deflatedHtml) {
          fs.writeFile(mainPagePath, deflatedHtml, finished);
        });
      } else {
        fs.writeFile(mainPagePath, html, finished);
      }
    }

    function createMainPage(finished) {
      logger.log('Creating main page...');
      const doc = domino.createDocument(
        (zim.mobileLayout ? htmlMobileTemplateCode : htmlDesktopTemplateCode)
          .replace('__ARTICLE_JS_LIST__', '')
          .replace('__ARTICLE_CSS_LIST__', '')
          .replace('__ARTICLE_CONFIGVARS_LIST__', '')
      );
      doc.getElementById('titleHeading').innerHTML = 'Summary';
      doc.getElementsByTagName('title')[0].innerHTML = 'Summary';

      let html = '<ul>\n';
      Object.keys(articleIds).sort().map(function(articleId) {
        html = html + `<li><a href="${env.getArticleBase(articleId, true)}"\>${articleId.replace(/_/g, ' ')}<a></li>\n`;
      });
      html = html + '</ul>\n';
      doc.getElementById('mw-content-text').innerHTML = html;

      /* Write the static html file */
      writeMainPage(doc.documentElement.outerHTML, finished);
    }

    function createMainPageRedirect(finished) {
      logger.log('Create main page redirection...');
      let html = redirectTemplate({
        title: zim.mainPageId.replace(/_/g, ' '),
        target: env.getArticleBase(zim.mainPageId, true)
      });
      writeMainPage(html, finished);
    }

    if (zim.mainPageId) {
      createMainPageRedirect(finished);
    } else {
      createMainPage(finished);
    }
  }

  process.on('uncaughtException', function(error) {
    console.error(error.stack);
    process.exit(42);
  });
}

module.exports = {
  getParametersList,
  execute
};
