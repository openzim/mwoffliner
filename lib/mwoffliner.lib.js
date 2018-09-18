/* ********************************** */
/* MODULE VARIABLE SECTION ********** */
/* ********************************** */

import fs from 'fs';
import domino from 'domino';
import async from 'async';
import { http, https } from 'follow-redirects';
import zlib from 'zlib';
import swig from 'swig-templates';
import urlParser from 'url';
import pathParser from 'path';
import { exec } from 'child_process';
import os from 'os';
import crypto from 'crypto';
import unicodeCutter from 'utf8-binary-cutter';
import htmlMinifier from 'html-minifier';
import parsoid from 'parsoid';
import fetch from 'node-fetch';

import MediaWiki from './MediaWiki';
import Logger from './Logger';
import Downloader from './Downloader';
import config from './config';
import DU from './DOMUtils';
import Redis from './redis';
import U from './Utils';
import Zim from './Zim';
import OfflinerEnv from './OfflinerEnv';
import parameterList from './parameterList';

function getParametersList() {
  // Want to remove this anonymous function. Need to investigate to see if it's needed
  return parameterList;
}

function execute(argv) {
  /* ********************************* */
  /* CUSTOM VARIABLE SECTION ********* */
  /* ********************************* */

  const {
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
    addNamespaces: _addNamespaces,
  } = argv;

  let {
    parsoidUrl,
  } = argv;

  /* HTTP user-agent string */
  // const adminEmail = argv.adminEmail;
  U.exitIfError(!U.isValidEmail(adminEmail), `Admin email ${adminEmail} is not valid`);

  /* ZIM custom Favicon */
  U.exitIfError(customZimFavicon && !fs.existsSync(customZimFavicon), `Path ${customZimFavicon} is not a valid PNG file.`);

  /* Number of parallel requests */
  U.exitIfError(_speed && isNaN(_speed), 'speed is not a number, please give a number value to --speed');
  const cpuCount = os.cpus().length;
  const speed = cpuCount * (_speed || 1);

  /* Necessary to avoid problems with https */
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  /* logger */
  const logger = new Logger(verbose);

  /* Wikipedia/... URL; Normalize by adding trailing / as necessary */
  const mw = new MediaWiki(logger, {
    base: mwUrl,
    wikiPath: mwWikiPath,
    apiPath: mwApiPath,
    domain: mwDomain,
    username: mwUsername,
    password: mwPassword,
    spaceDelimiter: '_',
  });

  /* Download helpers; TODO: Merge with something else / expand this. */
  const downloader = new Downloader(
    logger,
    mw,
    `${config.userAgent} (${adminEmail})`,
    requestTimeout || config.defaults.requestTimeout,
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
      'wiktionary',
    ];
    if (wmProjects.contains(hostParts[1]) || hostParts[0].length < hostParts[1].length) {
      [_, creator] = hostParts; // Name of the wikimedia project
    }
  }
  creator = creator.charAt(0).toUpperCase() + creator.substr(1);

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
      parsoid
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
        })
        .catch((err) => {
          U.exitIfError(err, `Error starting Parsoid: ${err}`);
        });
      parsoidUrl = `http://localhost:8000/${webUrlHost}/v3/page/pagebundle/`;
      parsoidContentType = 'json';
    } else {
      parsoidUrl = `${mw.apiUrl}action=visualeditor&format=json&paction=parse&page=`;
      parsoidContentType = 'json';
    }
  }

  /** ********************************* */
  /* RUNNING CODE ******************** */
  /** ********************************* */

  /* Check if opt. binaries are available */
  const optBinaries = [
    'jpegoptim --version',
    'pngquant --version',
    'gifsicle --version',
    'advdef --version',
    'file --help',
    'stat --version',
    'convert --version',
  ];
  try {
    env.dumps.forEach((dump) => {
      if (dump.toLowerCase().indexOf('nozim') < 0) {
        optBinaries.push('zimwriterfs --help');
        throw new Error('BreakException'); // breakException not defined. Need to fix.
      }
    });
  } catch (e) {
    console.warn(e);
  }
  optBinaries.forEach((cmd) => {
    exec(
      cmd,
      (error) => {
        U.exitIfError(error, `Failed to find binary "${cmd.split(' ')[0]}": (' + error + ')`);
      },
      true,
      true,
    );
  });

  /* Setup redis client */
  const redis = new Redis(env, argv, config);

  /* Some helpers */
  function readTemplate(t) {
    return fs.readFileSync(pathParser.resolve(__dirname, t), 'utf-8');
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

  const cssLinks = config.output.cssResources.reduce((buf, css) => buf + genHeaderCSSLink(css), '');

  /* Compile templates */
  const redirectTemplate = swig.compile(readTemplate(config.output.templates.redirects));
  const footerTemplate = swig.compile(readTemplate(config.output.templates.footer));
  const leadSectionTemplate = swig.compile(readTemplate(config.output.templates.lead_section_wrapper));
  const sectionTemplate = swig.compile(readTemplate(config.output.templates.section_wrapper));
  const subSectionTemplate = swig.compile(readTemplate(config.output.templates.subsection_wrapper));

  /** ********************************* */
  /* CONSTANT VARIABLE SECTION ******* */
  /** ********************************* */

  const genericJsModules = config.output.mw.js;
  const genericCssModules = zim.mobileLayout ? config.output.mw.css.mobile : config.output.mw.css.desktop;

  const mediaRegex = /^(.*\/)([^/]+)(\/)(\d+px-|)(.+?)(\.[A-Za-z0-9]{2,6}|)(\.[A-Za-z0-9]{2,6}|)$/;
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
      (finished) => {
        async.eachSeries(
          env.dumps,
          (dump, finishedDump) => {
            logger.log('Starting a new dump...');
            env.nopic = dump.toString().search('nopic') >= 0;
            env.novid = dump.toString().search('novid') >= 0;
            env.nozim = dump.toString().search('nozim') >= 0;
            env.nodet = dump.toString().search('nodet') >= 0;
            env.keepHtml = env.nozim || env.keepHtml;
            env.htmlRootPath = env.computeHtmlRootPath();

            async.series(
              [
                finishedTask => zim.createSubDirectories(finishedTask),
                finishedTask => (zim.mobileLayout ? saveStaticFiles(finishedTask) : finishedTask()),
                finishedTask => saveStylesheet(finishedTask),
                finishedTask => saveFavicon(finishedTask),
                finishedTask => getMainPage(finishedTask),
                finishedTask => (env.writeHtmlRedirects ? saveHtmlRedirects(finishedTask) : finishedTask()),
                finishedTask => saveArticles(dump, finishedTask),
                finishedTask => drainDownloadFileQueue(finishedTask),
                finishedTask => drainOptimizationQueue(finishedTask),
                finishedTask => zim.buildZIM(finishedTask),
                finishedTask => redis.delMediaDB(finishedTask),
              ],
              error => finishedDump(error),
            );
          },
          () => {
            async.series(
              [
                (finishedTask) => {
                  if (skipCacheCleaning) {
                    logger.log('Skipping cache cleaning...');
                    exec(`rm -f "${zim.cacheDirectory}ref"`, finishedTask);
                  } else {
                    logger.log('Cleaning cache');
                    exec(
                      `find "${zim.cacheDirectory}" -type f -not -newer "${zim.cacheDirectory}ref" -exec rm {} \\;`,
                      finishedTask,
                    );
                  }
                },
              ],
              error => finished(error),
            );
          },
        );
      },
    ],
    (error) => {
      async.series(
        [
          (finished) => {
            redis.flushDBs(finished);
          },
          (finished) => {
            redis.quit();
            logger.log('Closing HTTP agents...');
            closeAgents();
            finished(error);
          },
        ],
        () => {
          logger.log('All dumping(s) finished with success.');

          /* Time to time the script hungs here. Forcing the exit */
          process.exit(0);
        },
      );
    },
  );

  /** ********************************* */
  /* MEDIA RELATED QUEUES ************ */
  /** ********************************* */

  /* Setting up media optimization queue */
  const optimizationQueue = async.queue((file, finished) => {
    const { path } = file;

    function getOptimizationCommand(path, forcedType) {
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
      } if (type === 'png' || type === 'PNG') {
        return (
          `pngquant --verbose --strip --nofs --force --ext="${tmpExt}" "${path}" &&\
          advdef -q -z -4 -i 5 "${tmpPath}" &&\
          if [ $(stat -c%s "${tmpPath}") -lt $(stat -c%s "${path}") ]; then mv "${tmpPath}" "${path}"; else rm "${tmpPath}"; fi`
        );
      } if (type === 'gif' || type === 'GIF') {
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

  process.on('uncaughtException', (error) => {
    console.error(error.stack);
    process.exit(42);
  });
}

export {
  getParametersList,
  execute,
};
