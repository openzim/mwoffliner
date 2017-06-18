"use strict";

/************************************/
/* MODULE VARIABLE SECTION **********/
/************************************/

var fs = require('fs');
var domino = require('domino');
var jsdom = require('jsdom');
var async = require('async');
var http = require('follow-redirects').http;
var https = require('follow-redirects').https;
var zlib = require('zlib');
var swig = require('swig');
var urlParser = require('url');
var pathParser = require('path');
var homeDirExpander = require('expand-home-dir');
var mkdirp = require('mkdirp');
var countryLanguage = require('country-language');
var redis = require('redis');
var childProcess = require('child_process');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var os = require('os');
var crypto = require('crypto');
var unicodeCutter = require('utf8-binary-cutter');
var htmlMinifier = require('html-minifier');
const parsoid = require('parsoid');
const fetch = require('node-fetch');

module.exports = {
    getParametersList: () => [
        { name: 'mwUrl', description: 'Mediawiki base URL. Dont forget the trailing /', required: true },
        { name: 'adminEmail', description: 'Email of the mwoffliner user which will be put in the HTTP user-agent string', required: true },
        { name: 'articleList', description: 'File with one title (in UTF8) per line', required: false },
        { name: 'cacheDirectory', description: 'Directory where files are permanently cached', required: false },
        { name: 'customZimFavicon', description: 'Use this option to give a path to a PNG favicon, it will be used in place of the Mediawiki logo.', required: false },
        { name: 'customZimTitle', description: 'Allow to configure a custom ZIM file title.', required: false },
        { name: 'customZimDescription', description: 'Allow to configure a custom ZIM file description.', required: false },
        { name: 'customMainPage', description: 'Allow to configure a custom page as welcome page.', required: false },
        { name: 'deflateTmpHtml', description: 'To reduce I/O, HTML pages might be deflated in tmpDirectory.', required: false },
        { name: 'filenamePrefix', description: 'For the part of the ZIM filename which is before the date part.', required: false },
        { name: 'format', description: 'To custom the output with comma separated values : "nopic,novid,nozim"', required: false },
        { name: 'keepEmptyParagraphs', description: 'Keep all paragraphs, even empty ones.', required: false },
        { name: 'keepHtml', description: 'If ZIM built, keep the temporary HTML directory', required: false },
        { name: 'mwWikiPath', description: 'Mediawiki wiki base path (per default "/wiki/"', required: false },
        { name: 'mwApiPath', description: 'Mediawiki API path (per default "/w/api.php"', required: false },
        { name: 'mwDomain', description: 'Mediawiki user domain (thought for private wikis)', required: false },
        { name: 'mwUsername', description: 'Mediawiki username (thought for private wikis)', required: false },
        { name: 'mwPassword', description: 'Mediawiki user password (thought for private wikis)', required: false },
        { name: 'minifyHtml', description: 'Try to reduce the size of the HTML', required: false },
        { name: 'outputDirectory', description: 'Directory to write the downloaded content', required: false },
        { name: 'parsoidUrl', description: 'Mediawiki Parsoid URL', required: false },
        { name: 'publisher', description: "ZIM publisher meta data, per default 'Kiwix'", required: false },
        { name: 'redisSocket', description: 'Path to Redis socket file', required: false },
        { name: 'requestTimeout', description: 'Request timeout (in seconds)', required: false },
        { name: 'resume', description: 'Do not overwrite if ZIM file already created', required: false },
        { name: 'skipHtmlCache', description: 'Do not cache Parsoid HTML output (and do not use any cached HTML content)', required: false },
        { name: 'skipCacheCleaning', description: 'Do not search for old/outdated files in the cache', required: false },
        { name: 'speed', description: 'Multiplicator for the number of parallel HTTP requests on Parsoid backend (per default the number of CPU cores). The default value is 1.', required: false },
        { name: 'tmpDirectory', description: 'Directory where files are temporary stored', required: false },
        { name: 'verbose', description: 'Print debug information to the stdout', required: false },
        { name: 'withZimFullTextIndex', description: 'Include a fulltext search index to the ZIM', required: false },
        { name: 'writeHtmlRedirects', description: 'Write redirect as HTML files', required: false },
        { name: 'spaceDelimiter', decription: 'Character to use in place of space in titles (Default is "_")', required: false },
        { name: 'localParsoid', description: 'Create a local parsoid instance default value is false', required: false },
        { name: 'mobileLayout', description: 'HTML optimised for mobile mobile use', required: false }
    ],

    execute: function (argv) {

        /************************************/
        /* CUSTOM VARIABLE SECTION **********/
        /************************************/

        /* Formats */
        var dumps = [''];
        if (argv.format) {
            if (argv.format instanceof Array) {
                dumps = new Array();
                argv.format.forEach(function (value) {
                    dumps.push(value == true ? '' : value);
                });
            } else if (argv.format != true) {
                dumps = [argv.format];
            }
        }

        /* Template code for any redirect to be written on the FS */
        var redirectTemplateCode = '<html><head><meta charset="UTF-8" /><title>{{ title }}</title><meta http-equiv="refresh" content="0; URL={{ target }}"></head><body></body></html>';

        /* All DOM nodes with on of these styles will be removed */
        /* On Wikivoyage 'noprint' remove also top banners like on 'South America'. */
        var cssClassBlackList = [ 'noprint', 'metadata', 'ambox', 'stub', 'topicon', 'magnify', 'navbar', 'mwe-math-mathml-inline', 'mw-kartographer-container' ];

        /* All DOM node with these styles will be deleted if no A node is included in the sub-tree */
        var cssClassBlackListIfNoLink = [ 'mainarticle', 'seealso', 'dablink', 'rellink', 'hatnote' ];

        /* All DOM nodes which we should for to display */
        var cssClassDisplayList = ['thumb'];

        /* List of style to be removed */
        var cssClassCallsBlackList = ['plainlinks'];

        /* All nodes with one of these ids will be remove */
        var idBlackList = ['purgelink'];

        /* HTTP user-agent string */
        var adminEmail = argv.adminEmail;
        var userAgentString = 'MWOffliner/HEAD';
        if (validateEmail(adminEmail)) {
            userAgentString += ' (' + adminEmail + ')';
        } else {
            console.error('Admin email ' + adminEmail + ' is not valid');
            process.exit(1);
        }
        var loginCookie = '';

        /* Directory wehre everything is saved at the end of the process */
        var outputDirectory = argv.outputDirectory ? homeDirExpander(argv.outputDirectory) + '/' : 'out/';

        /* Directory where temporary data are saved */
        var tmpDirectory = argv.tmpDirectory ? homeDirExpander(argv.tmpDirectory) + '/' : 'tmp/';
        var deflateTmpHtml = argv.deflateTmpHtml;

        /* Parsoid URL */
        var parsoidUrl = argv.parsoidUrl;
        var localParsoid = argv.localParsoid;

        /* ZIM custom Favicon */
        var customZimFavicon = argv.customZimFavicon;
        if (customZimFavicon && !fs.existsSync(customZimFavicon)) {
            console.error('Path "' + customZimFavicon + '" is not a valid PNG file.');
            process.exit(1);
        }

        /* If ZIM is built, should temporary HTML directory be kept */
        var keepHtml = argv.keepHtml;

        /* List of articles is maybe in a file */
        var articleList = argv.articleList;

        /* Prefix part of the filename (radical) */
        var filenamePrefix = argv.filenamePrefix || '';

        var spaceDelimiter = argv.spaceDelimiter || '_';

        /* Number of parallel requests */
        var cpuCount = os.cpus().length;
        if (argv.speed && isNaN(argv.speed)) {
            console.error('speed is not a number, please give a number value to --speed');
            process.exit(1);
        }
        var speed = cpuCount * (argv.speed || 1);

        /* Necessary to avoid problems with https */
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        /* Verbose */
        var verbose = argv.verbose;

        /* Optimize HTML */
        var minifyHtml = argv.minifyHtml;

        /* How to write redirects */
        var writeHtmlRedirects = argv.writeHtmlRedirects;

        /* File where redirects might be save if --writeHtmlRedirects is not set */
        var redirectsCacheFile;

        /* Cache strategy */
        var skipHtmlCache = argv.skipHtmlCache;
        var skipCacheCleaning = argv.skipCacheCleaning;

        /* Should we keep ZIM file generation if ZIM file already exists */
        var resume = argv.resume;

        /* Path to a Redis socket */
        var redisSocket = argv.redisSocket ? argv.redisSocket : '/dev/shm/redis.sock';

        /* Default request timeout */
        var requestTimeout = argv.requestTimeout ? argv.requestTimeout : 60;

        /* Keep empty paragraphs */
        var keepEmptyParagraphs = argv.keepEmptyParagraphs;

        /* Include fulltext index in ZIM file */
        var withZimFullTextIndex = argv.withZimFullTextIndex;

        /* ZIM publisher */
        var publisher = argv.publisher || 'Kiwix';

        /* Wikipedia/... URL */
        var mwUrl = argv.mwUrl;
        var hostParts = urlParser.parse(mwUrl).hostname.split('.');

        /* ZIM (content) creator */
        var creator = hostParts[0];
        if (hostParts.length > 1) {
            creator =
                hostParts[1] != 'wikipedia' &&
                    hostParts[1] != 'wikisource' &&
                    hostParts[1] != 'wikibooks' &&
                    hostParts[1] != 'wikiquote' &&
                    hostParts[1] != 'wikivoyage' &&
                    hostParts[1] != 'wikiversity' &&
                    hostParts[1] != 'wikinews' &&
                    hostParts[1] != 'wiktionary' &&
                    hostParts[0].length > hostParts[1].length
                    ? hostParts[0] : hostParts[1];
        }
        creator = creator.charAt(0).toUpperCase() + creator.substr(1);

        /* Namespaces to mirror */
        var namespacesToMirror = new Array();

        /* License footer template code */
        var footerTemplateCode = `
<div style="clear:both; background-image:linear-gradient(180deg, #E8E8E8, white); border-top: dashed 2px #AAAAAA; padding: 0.5em 0.5em 2em 0.5em; margin-top: 1em; direction: ltr;">
    This article is issued from
    <a class="external text"{% if date %} title="last edited on {{ date }}"{% endif %} href="{{ webUrl }}{{ articleId }}?oldid={{ oldId }}">{{ creator }}</a>.
    The text is licensed under <a class="external text" href="http://creativecommons.org/licenses/by-sa/4.0/">Creative Commons - Attribution - Sharealike</a>.
    Additional terms may apply for the media files.
</div>`

        /************************************/
        /* SYSTEM VARIABLE SECTION **********/
        /************************************/

        var INFINITY_WIDTH = 9999999;
        var ltr = true;
        var autoAlign = ltr ? 'left' : 'right';
        var revAutoAlign = ltr ? 'right' : 'left';
        var subTitle = '';
        var langIso2 = 'en';
        var langIso3 = 'eng';
        var name = argv.customZimTitle || '';
        var description = argv.customZimDescription || '';
        var mainPageId = argv.customMainPage || '';
        var articleIds = {};
        var namespaces = {};
        var mwWikiPath = argv.mwWikiPath !== undefined && argv.mwWikiPath !== true ? argv.mwWikiPath : 'wiki';
        var webUrl = mwUrl + mwWikiPath + '/';
        var webUrlHost = urlParser.parse(webUrl).host;
        var webUrlPath = urlParser.parse(webUrl).pathname;
        var webUrlPort = getRequestOptionsFromUrl(webUrl).port;
        var mwApiPath = argv.mwApiPath || 'w/api.php';
        var apiUrl = mwUrl + mwApiPath + '?';
        var parsoidContentType = 'html';
        if (!parsoidUrl) {
            if (localParsoid) {
                console.info('Starting Parsoid');
                //Icky but necessary
                fs.writeFileSync('./localsettings.js', `
                exports.setup = function(parsoidConfig) {
                    parsoidConfig.setMwApi({
                        uri: '${mwUrl + mwApiPath}',
                    });
                };
                `, 'utf8');
                parsoid.apiServiceWorker({
                    appBasePath: './node_modules/parsoid',
                    logger: console,
                    config: { localsettings: '../../localsettings.js' }
                })
                    .then(_ => {
                        fs.unlinkSync('./localsettings.js');
                        console.info('Parsoid Started Successfully')
                    })
                    .catch(err => {
                        console.error(`Error starting Parsoid: ${err}`)
                        process.exit(1);
                    });
                parsoidUrl = `http://localhost:8000/${webUrlHost}/v3/page/pagebundle/`;
                parsoidContentType = 'json';
            } else {
                parsoidUrl = apiUrl + "action=visualeditor&format=json&paction=parse&page=";
                parsoidContentType = 'json';
            }
        }
        var nopic = false;
	var novid = false;
        var nozim = false;
        var filenameRadical = '';
        var htmlRootPath = '';
        var cacheDirectory = '';
        var cacheDirectory = (argv.cacheDirectory ? argv.cacheDirectory : pathParser.resolve(process.cwd(), 'cac')) + '/';
        var mwUsername = argv.mwUsername || '';
        var mwDomain = argv.mwDomain || '';
        var mwPassword = argv.mwPassword || '';
        const mobileLayout = argv.mobileLayout || false

        /************************************/
        /* CONTENT DATE *********************/
        /************************************/

        var date = new Date();
        var contentDate = date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2);

        /************************************/
        /* RUNNING CODE *********************/
        /************************************/

        /* Check if opt. binaries are available */
        var optBinaries = ['jpegoptim --version', 'pngquant --version', 'gifsicle --version', 'advdef --version', 'file --help', 'stat --version', 'convert --version'];
        try {
            dumps.forEach(function (dump) {
                if (dump.toLowerCase().indexOf('nozim') < 0) {
                    optBinaries.push('zimwriterfs --help');
                    throw BreakException;
                }
            });
        } catch (e) {
        }
        optBinaries.forEach(function (cmd) {
            exec(cmd, function (error, stdout, stderr) {
                if (error) {
                    console.error('Failed to find binary "' + cmd.split(' ')[0] + '": (' + error + ')');
                    process.exit(1);
                }
            }, true, true);
        });

        /* Setup redis client */
        var redisClient = redis.createClient(redisSocket);
        var redisNamePrefix = (new Date).getTime();
        var redisRedirectsDatabase = redisNamePrefix + 'r';
        var redisMediaIdsDatabase = redisNamePrefix + 'm';
        var redisArticleDetailsDatabase = redisNamePrefix + 'd';
        const redisModuleDatabase = redisNamePrefix + 'mod'
        var redisCachedMediaToCheckDatabase = redisNamePrefix + 'c';

        /* Compile templates */
        var redirectTemplate = swig.compile(redirectTemplateCode);
        var footerTemplate = swig.compile(footerTemplateCode);

        /************************************/
        /* CONSTANT VARIABLE SECTION ********/
        /************************************/

        var styleDirectory = 's';
        var styleModulesDirectory = 'css_modules'
        var mediaDirectory = 'm';
        var javascriptDirectory = 'j';
        var jsModulesDirectory = 'js_modules'

        const genericJsModules = ['startup', 'jquery', 'mediawiki', 'site']
        const genericCssModules = mobileLayout
            ? ['skins.minerva.base.reset|skins.minerva.content.styles|ext.cite.style|mediawiki.page.gallery.styles|mobile.app.pagestyles.android|mediawiki.skinning.content.parsoid']
            : []

        // this module has no css, blacklisting it avoid creating an empty file that generate an error in firefox
        // error is "style sheet could not be loaded"
        const blackListCssModules = ['mediawiki.page.gallery']

        var mediaRegex = /^(.*\/)([^\/]+)(\/)(\d+px-|)(.+?)(\.[A-Za-z0-9]{2,6}|)(\.[A-Za-z0-9]{2,6}|)$/;
        var htmlMobileTemplateCode = `
<!DOCTYPE html>
<html class='client-js'>
  <head>
    <meta charset="UTF-8" />
    <title></title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script>
        function importScript(){return 1} // this is to avoid the error from site.js
    </script>
    __ARTICLE_CSS_LIST__
    <link href="${styleDirectory}/${styleModulesDirectory}/mobile.css" rel="stylesheet" type="text/css" />
    <link href="${styleDirectory}/${styleModulesDirectory}/content.parsoid.css" rel="stylesheet" type="text/css" />
    <link href="${styleDirectory}/${styleModulesDirectory}/inserted_style_mobile.css" rel="stylesheet" type="text/css" />
  </head>
  <body class="mediawiki ltr sitedir-ltr mw-hide-empty-elt ns-0 ns-subject page-Lyon rootpage-Lyon stable skin-minerva action-view animations">
    <div id="mw-mf-viewport" class="feature-header-v2">
      <div id="mw-mf-page-center">
        <div id="content" class="mw-body">
          <a id="top"></a>
          <div id="bodyContent" class="content">
            <h1 id="titleHeading" style="background-color: white; margin: 0;"></h1>
            <div id="mw-content-text" lang="fr" dir="ltr" class="mw-content-ltr">
            </div>
          </div>
        </div>
      </div>
    </div>
    <script>
      // this function is to be able to open/close section in mobile version since the code from wiki meant to do that doesn't work
      function toggleOpenSection(id) {
        if (id === 0) return // do not allow to hide the main section
        $('#mf-section-'+id).toggleClass('open-block').prev().toggleClass('open-block')
      }
    </script>
    __ARTICLE_CONFIGVARS_LIST__
    __ARTICLE_JS_LIST__
  </body>
</html>`
        var htmlDesktopTemplateCode = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title></title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script>
        function importScript(){return 1} // this is to avoid the error from site.js
    </script>
    <link rel="stylesheet" href="s/style.css" />
    __ARTICLE_CSS_LIST__
  </head>
  <body class="mw-body mw-body-content mediawiki" style="background-color: white; margin: 0; border-width: 0px; padding: 0px;">
    <div id="content" class="mw-body" style="padding: 1em; border-width: 0px; max-width: 55.8em; margin: 0 auto 0 auto">
      <a id="top"></a>
      <h1 id="titleHeading" style="background-color: white; margin: 0;"></h1>
      <div id="mw-content-text">
      </div>
    </div>
    __ARTICLE_CONFIGVARS_LIST__
    __ARTICLE_JS_LIST__
  </body>
</html>`
        // __ARTICLE_JS_LIST__ will be replaced by the list of script tag linking to all the js modules dependencies
        // __ARTICLE_CSS_LIST__ will be replaced by the list of link tag linking to all the css modules dependencies

        /* Get content */
        async.series(
            [
                function (finished) { login(finished) },
                function (finished) { getTextDirection(finished) },
                function (finished) { getSiteInfo(finished) },
                function (finished) { getSubTitle(finished) },
                function (finished) { getNamespaces(finished) },
                function (finished) { createDirectories(finished) },
                function (finished) { prepareCache(finished) },
                function (finished) { checkResume(finished) },
                function (finished) { getArticleIds(finished) },
                function (finished) { cacheRedirects(finished) },
                function (finished) {
                    async.eachSeries(
                        dumps,
                        function (dump, finished) {
                            printLog('Starting a new dump...');
                            nopic = dump.toString().search('nopic') >= 0 ? true : false;
			    novid = dump.toString().search('novid') >= 0 ? true : false;
                            nozim = dump.toString().search('nozim') >= 0 ? true : false;
                            keepHtml = nozim ? true : keepHtml;
                            filenameRadical = computeFilenameRadical();
                            htmlRootPath = computeHtmlRootPath();

                            async.series(
                                [
                                    function (finished) { createSubDirectories(finished) },
                                    function (finished) { mobileLayout ? saveStaticFiles(finished) : finished() },
                                    function (finished) { saveStylesheet(finished) },
                                    function (finished) { saveFavicon(finished) },
                                    function (finished) { getMainPage(finished) },
                                    function (finished) { writeHtmlRedirects ? saveHtmlRedirects(finished) : finished() },
                                    function (finished) { saveArticles(dump, finished) },
                                    function (finished) { drainDownloadFileQueue(finished) },
                                    function (finished) { drainOptimizationQueue(finished) },
                                    function (finished) { buildZIM(finished) },
                                    function (finished) { endProcess(finished) }
                                ],
                                function (error, result) {
                                    finished();
                                });
                        },
                        function (error) {
                            async.series(
                                [
                                    function (finished) {
                                        if (skipCacheCleaning) {
                                            printLog('Skipping cache cleaning...');
                                            exec('rm -f "' + cacheDirectory + 'ref"', finished);
                                        } else {
                                            printLog('Cleaning cache');
                                            exec('find "' + cacheDirectory + '" -type f -not -newer "' + cacheDirectory + 'ref" -exec rm {} \\;', finished);
                                        }
                                    },
                                ],
                                function (error, result) {
                                    finished();
                                });
                        }
                    )
                }
            ],
            function (error) {
                async.series(
                    [
                        function (finished) {
                            printLog('Flushing redis databases...');
                            redisClient.del(redisRedirectsDatabase, redisMediaIdsDatabase, redisArticleDetailsDatabase, redisCachedMediaToCheckDatabase, function () {
                                printLog('Redis databases flushed.');
                                finished();
                            })
                        },
                        function (finished) {
                            printLog('Quitting redis databases...');
                            redisClient.quit();
                            printLog('Closing HTTP agents...');
                            closeAgents();
                            finished();
                        }
                    ],
                    function (error, result) {
                        printLog('All dumping(s) finished with success.');

                        /* Time to time the script hungs here. Forcing the exit */
                        process.exit(0);
                    }
                )
            }
        );

        /************************************/
        /* MEDIA RELATED QUEUES *************/
        /************************************/

        /* Setting up media optimization queue */
        var optimizationQueue = async.queue(function (file, finished) {
            var path = file.path;

            function getOptimizationCommand(path, forcedType) {
                var ext = pathParser.extname(path).split('.')[1] || '';
                var basename = path.substring(0, path.length - ext.length - 1) || '';
                var tmpExt = '.' + randomString(5) + '.' + ext;
                var tmpPath = basename + tmpExt;
                var type = forcedType || ext;

                /* Escape paths */
                path = path.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
                tmpPath = tmpPath.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');

                if (type === 'jpg' || type === 'jpeg' || type === 'JPG' || type === 'JPEG') {
                    return 'jpegoptim --strip-all --force --all-normal -m60 "' + path + '"';
                } else if (type === 'png' || type === 'PNG') {
                    return 'pngquant --verbose --strip --nofs --force --ext="' + tmpExt + '" "' + path +
                        '" && advdef -q -z -4 -i 5 "' + tmpPath +
                        '" && if [ $(stat -c%s "' + tmpPath + '") -lt $(stat -c%s "' + path + '") ]; then mv "' + tmpPath + '" "' + path + '"; else rm "' + tmpPath + '"; fi';
                } else if (type === 'gif' || type === 'GIF') {
                    return 'gifsicle --verbose --colors 64 -O3 "' + path + '" -o "' + tmpPath +
                        '" && if [ $(stat -c%s "' + tmpPath + '") -lt $(stat -c%s "' + path + '") ]; then mv "' + tmpPath + '" "' + path + '"; else rm "' + tmpPath + '"; fi';
                }
            }

            if (path) {
                fs.stat(path, function (error, stats) {
                    if (!error && stats.size == file.size) {
                        var cmd = getOptimizationCommand(path);

                        if (cmd) {
                            async.retry(5, function (finished, skip) {
                                exec(cmd, function (executionError, stdout, stderr) {
                                    if (executionError) {
                                        fs.stat(path, function (error, stats) {
                                            if (!error && stats.size > file.size) {
                                                finished(null, true);
                                            } else if (!error && stats.size < file.size) {
                                                finished('File to optim is smaller (before optim) than it should.');
                                            } else {
                                                exec('file -b --mime-type "' + path + '"', function (error, stdout, stderr) {
                                                    var type = stdout.replace(/image\//, '').replace(/[\n\r]/g, '');
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
                                function (error, skip) {
                                    if (error) {
                                        console.error('Executing command : ' + cmd);
                                        console.error('Failed to optim ' + path + ', with size=' + file.size + ' (' + error + ')');
                                    } else if (skip) {
                                        printLog('Optimization skipped for ' + path + ', with size=' + file.size + ', a better version was downloaded meanwhile.');
                                    } else {
                                        printLog('Successfuly optimized ' + path);
                                    }
                                    finished();
                                });
                        } else {
                            finished();
                        }
                    } else {
                        console.error('Failed to start to optim ' + path + '. Size should be ' + file.size +
                            ' (' + (error ? 'file was probably deleted, here the error: ' + error : (stats ? stats.size : 'No stats information')) + ')');
                        finished();
                    }
                });
            } else {
                finished();
            }

        }, cpuCount * 2);

        /* Setting up the downloading queue */
        var downloadFileQueue = async.queue(function (url, finished) {
            if (url) {
                downloadFileAndCache(url, finished);
            } else {
                finished();
            }
        }, speed * 5);

        /************************************/
        /* FUNCTIONS ************************/
        /************************************/

        function login(finished) {
            if (mwUsername != '' && mwPassword != '') {
                var url = apiUrl + 'action=login&format=json&lgname=' + mwUsername + '&lgpassword=' + mwPassword;
                if (mwDomain != '') {
                    url = url + '&lgdomain=' + mwDomain;
                }

                downloadContent(url, function (content, responseHeaders) {
                    var body = content.toString();
                    var jsonResponse = JSON.parse(body)['login'];
                    loginCookie = jsonResponse['cookieprefix'] + '_session=' + jsonResponse['sessionid'];

                    if (jsonResponse['result'] == 'SUCCESS') {
                        finished();
                    } else {
                        url = url + '&lgtoken=' + jsonResponse['token'];
                        downloadContent(url, function (content, responseHeaders) {
                            body = content.toString();
                            jsonResponse = JSON.parse(body)['login'];

                            if (jsonResponse['result'] == 'Success') {
                                loginCookie = jsonResponse['cookieprefix'] + '_session=' + jsonResponse['sessionid'];
                                finished();
                            } else {
                                console.error('Login failed');
                                process.exit(1);
                            }
                        });
                    }
                });
            } else {
                finished();
            }
        }

        function checkResume(finished) {
            for (var i = 0; i < dumps.length; i++) {
                var dump = dumps[i];
                nopic = dump.toString().search('nopic') >= 0 ? true : false;
		novid = dump.toString().search('novid') >= 0 ? true : false;
                nozim = dump.toString().search('nozim') >= 0 ? true : false;
                htmlRootPath = computeHtmlRootPath();

                if (resume && !nozim) {
                    var zimPath = computeZimRootPath();
                    if (fs.existsSync(zimPath)) {
                        printLog(zimPath + ' is already done, skip dumping & ZIM file generation');
                        dumps.splice(i, 1);
                        i--;
                    }
                }
            }
            finished(dumps.length > 0 ? false : true);
        }

        function closeAgents(finished) {
            http.globalAgent.destroy();
            https.globalAgent.destroy();
            if (finished) {
                finished();
            }
        }

        function prepareCache(finished) {
            printLog('Preparing cache...');
            cacheDirectory = cacheDirectory + computeFilenameRadical(true, true, true) + '/';
            redirectsCacheFile = computeRedirectsCacheFilePath();
            mkdirp(cacheDirectory + 'm/', function () {
                fs.writeFileSync(cacheDirectory + 'ref', '42');
                finished();
            });

        }

        function createDirectories(finished) {
            printLog('Creating base directories...');
            async.series(
                [
                    function (finished) { mkdirp(outputDirectory, finished) },
                    function (finished) { mkdirp(tmpDirectory, finished) },
                ],
                function (error) {
                    if (error) {
                        console.error('Unable to create mandatory directories : ' + error);
                        process.exit(1);
                    } else {
                        finished();
                    }
                });
        }

        function saveStaticFiles(finished) {
            try {
                fs.readFile(pathParser.resolve(__dirname, "../content.parsoid.css"), (err, data) =>
                    fs.writeFile(pathParser.resolve(htmlRootPath, `${styleDirectory}/${styleModulesDirectory}/content.parsoid.css`), data, () => {})
                )
            } catch (error) {
                console.error('Could not create content.parsoid.css file : ', error)
            }

            try {
                fs.readFile(pathParser.resolve(__dirname, "../mobile.css"), (err, data) =>
                    fs.writeFile(pathParser.resolve(htmlRootPath, `${styleDirectory}/${styleModulesDirectory}/mobile.css`), data, () => {})
                )
            } catch (error) {
                console.error('Could not create mobile.css file : ', error)
            }

            try {
                fs.readFile(pathParser.resolve(__dirname, "../inserted_style_mobile.css"), (err, data) =>
                    fs.writeFile(pathParser.resolve(htmlRootPath, `${styleDirectory}/${styleModulesDirectory}/inserted_style_mobile.css`), data, () => finished())
                )
            } catch (error) {
                console.error('Could not create inserted_style_mobile.css file : ', error)
                finished()
            }
        }

        function randomString( len ) {
            var randomString = '';
            var charSet = 'abcdefghijklmnopqrstuvwxyz0123456789';
            for (var i = 0; i < len; i++) {
                var randomPoz = Math.floor(Math.random() * charSet.length);
                randomString += charSet.substring(randomPoz, randomPoz + 1);
            }
            return randomString;
        }

        function extractTargetIdFromHref(href) {
            try {
                var pathname = urlParser.parse(href, false, true).pathname || '';
                if (pathname.indexOf('./') == 0) {
                    return myDecodeURIComponent(pathname.substr(2));
                } else if (pathname.indexOf(webUrlPath) == 0) {
                    return myDecodeURIComponent(pathname.substr(webUrlPath.length));
                }
            } catch (error) {
                console.error('Unable to parse href ' + href);
                return '';
            }
        }

        function computeFilenameRadical(withoutSelection, withoutContentSpecifier, withoutDate) {
            var radical;

            if (filenamePrefix) {
                radical = filenamePrefix;
            } else {
                radical = creator.charAt(0).toLowerCase() + creator.substr(1) + '_';
                var hostParts = urlParser.parse(webUrl).hostname.split('.');
                var langSuffix = langIso2;
                for (var i = 0; i < hostParts.length; i++) {
                    if (hostParts[i] === langIso3) {
                        langSuffix = hostParts[i];
                        break;
                    }
                }
                radical += langSuffix;
            }

            if (!withoutSelection) {
                if (articleList) {
                    radical += '_' + pathParser.basename(articleList, pathParser.extname(articleList)).toLowerCase().replace(/ /g, spaceDelimiter);
                } else {
                    radical += '_all';
                }
            }

            if (!withoutContentSpecifier) {
                radical += nopic ? '_nopic' : novid ? '_novid' : '';
            }

            if (!withoutDate) {
                radical += '_' + contentDate;
            }

            return radical;
        }

        function computeHtmlRootPath() {
            var htmlRootPath;

            if (nozim) {
                htmlRootPath = outputDirectory[0] === '/' ? outputDirectory : pathParser.resolve(process.cwd(), tmpDirectory) + '/';
            } else {
                htmlRootPath = tmpDirectory[0] === '/' ? tmpDirectory : pathParser.resolve(process.cwd(), tmpDirectory) + '/';
            }

            htmlRootPath += computeFilenameRadical() + '/';
            return htmlRootPath;
        }

        function computeZimRootPath() {
            var zimRootPath = outputDirectory[0] === '/' ? outputDirectory : pathParser.resolve(process.cwd(), outputDirectory) + '/';
            zimRootPath += computeFilenameRadical() + '.zim';
            return zimRootPath;
        }

        function computeZimName() {
            return (publisher ? publisher.toLowerCase() + '.' : '') + computeFilenameRadical(false, true, true);
        }

        function computeRedirectsCacheFilePath() {
            var redirectsCacheFilePath = cacheDirectory + computeFilenameRadical(false, true, true) + '.redirects';
            return redirectsCacheFilePath;
        }

        function buildZIM(finished) {
            if (!nozim) {
                exec('sync', function (error) {
                    var zimPath = computeZimRootPath();
                    var cmd = 'zimwriterfs --welcome=index.htm --favicon=favicon.png --language=' + langIso3
                        + (mainPageId ? ' --welcome=' + getArticleBase(mainPageId) : ' --welcome=index.htm')
                        + (deflateTmpHtml ? ' --inflateHtml ' : '')
                        + (verbose ? ' --verbose ' : '')
                        + (nopic ? ' --tags=nopic' : novid ? ' --tags=novid' : '')
                        + ' --name="' + computeZimName() + '"'
                        + (withZimFullTextIndex ? ' --withFullTextIndex' : '')
                        + (writeHtmlRedirects ? '' : ' --redirects="' + redirectsCacheFile + '"')
                        + ' --title="' + name + '" --description="' + (description || subTitle || name) + '" --creator="' + creator + '" --publisher="'
                        + publisher + '" "' + htmlRootPath + '" "' + zimPath + '"';
                    printLog('Building ZIM file ' + zimPath + ' (' + cmd + ')...');
                    printLog('RAID: ' + computeZimName());
                    executeTransparently(
                        'zimwriterfs',
                        [
                            deflateTmpHtml ? '--inflateHtml' : '',
                            verbose ? '--verbose' : '',
                            writeHtmlRedirects ? '' : '--redirects=' + redirectsCacheFile,
                            withZimFullTextIndex ? '--withFullTextIndex' : '',
                            nopic ? '--tags=nopic' : novid ? '--tags=novid' : '',
                            mainPageId ? '--welcome=' + getArticleBase(mainPageId) : '--welcome=index.htm',
                            '--favicon=favicon.png',
                            '--language=' + langIso3,
                            '--title=' + name,
                            '--name=' + computeZimName(),
                            '--description=' + (description || subTitle || name),
                            '--creator=' + creator,
                            '--publisher=' + publisher,
                            htmlRootPath,
                            zimPath
                        ],
                        function (error) {
                            if (error) {
                                console.error('Failed to build successfuly the ZIM file ' + zimPath + ' (' + error + ')');
                                process.exit(1);
                            } else {
                                printLog('ZIM file built at ' + zimPath);
                            }

                            /* Delete the html directory ? */
                            if (keepHtml) {
                                finished();
                            } else {
                                exec('rm -rf \"' + htmlRootPath + '\"', finished);
                            }
                        },
                        !verbose,
                        !verbose
                    );
                }).on('error', function (error) { console.error(error) });
            } else {
                finished();
            }
        }

        function endProcess(finished) {
            printLog('Dumping finished with success.');
            redisClient.del(redisMediaIdsDatabase, finished);
        }

        function drainDownloadFileQueue(finished) {
            printLog(downloadFileQueue.length() + " images still to be downloaded.");
            async.doWhilst(
                function (finished) {
                    if (downloadFileQueue.idle()) {
                        printLog('Process still downloading images...');
                    }
                    setTimeout(finished, 1000);
                },
                function () { return !downloadFileQueue.idle() },
                function (error) {
                    var drainBackup = downloadFileQueue.drain;
                    downloadFileQueue.drain = function (error) {
                        if (error) {
                            console.error('Error by downloading images' + error);
                            process.exit(1);
                        } else {
                            if (downloadFileQueue.length() == 0) {
                                printLog('All images successfuly downloaded');
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
            printLog(optimizationQueue.length() + ' images still to be optimized.');
            async.doWhilst(
                function (finished) {
                    if (optimizationQueue.idle()) {
                        printLog('Process still being optimizing images...');
                    }
                    setTimeout(finished, 1000);
                },
                function () { return !optimizationQueue.idle() },
                function (error) {
                    var drainBackup = optimizationQueue.drain;
                    optimizationQueue.drain = function (error) {
                        if (error) {
                            console.error('Error by optimizing images' + error);
                            process.exit(1);
                        } else {
                            if (optimizationQueue.length() == 0) {
                                printLog('All images successfuly optimized');
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
            printLog('Reset redirects cache file (or create it)');
            fs.openSync(redirectsCacheFile, 'w')

            printLog('Caching redirects...');
            function cacheRedirect(redirectId, finished) {
                redisClient.hget(redisRedirectsDatabase, redirectId, function (error, target) {
                    if (error) {
                        console.error('Unable to get a redirect target from redis for caching: ' + error);
                        process.exit(1);
                    } else {
                        if (target) {
                            printLog('Caching redirect ' + redirectId + ' (to ' + target + ')...');
                            var line = 'A\t' + getArticleBase(redirectId) + '\t' + redirectId.replace(/_/g, ' ') +
                                '\t' + getArticleBase(target, false) + '\n';
                            fs.appendFile(redirectsCacheFile, line, finished);
                        } else {
                            finished();
                        }
                    }
                });
            }

            redisClient.hkeys(redisRedirectsDatabase, function (error, keys) {
                if (error) {
                    console.error('Unable to get redirect keys from redis for caching: ' + error);
                    process.exit(1);
                } else {
                    async.eachLimit(keys, speed, cacheRedirect, function (error) {
                        if (error) {
                            console.error('Unable to cache a redirect: ' + error);
                            process.exit(1);
                        } else {
                            printLog('All redirects were cached successfuly.');
                            finished();
                        }
                    });
                }
            });
        }

        function saveHtmlRedirects(finished) {
            printLog('Saving HTML redirects...');

            function saveHtmlRedirect(redirectId, finished) {
                redisClient.hget(redisRedirectsDatabase, redirectId, function (error, target) {
                    if (error) {
                        console.error('Unable to get a redirect target from redis for saving: ' + error);
                        process.exit(1);
                    } else {
                        if (target) {
                            printLog('Writing HTML redirect ' + redirectId + ' (to ' + target + ')...');
                            var data = redirectTemplate({
                                title: redirectId.replace(/_/g, ' '),
                                target: getArticleUrl(target)
                            });
                            if (deflateTmpHtml) {
                                zlib.deflate(data, function (error, deflatedHtml) {
                                    fs.writeFile(getArticlePath(redirectId), deflatedHtml, finished);
                                });
                            } else {
                                fs.writeFile(getArticlePath(redirectId), data, finished);
                            }
                        } else {
                            finished();
                        }
                    }
                });
            }

            redisClient.hkeys(redisRedirectsDatabase, function (error, keys) {
                if (error) {
                    console.error('Unable to get redirect keys from redis for saving: ' + error);
                    process.exit(1);
                } else {
                    async.eachLimit(keys, speed, saveHtmlRedirect, function (error) {
                        if (error) {
                            console.error('Unable to save a HTML redirect: ' + error);
                            process.exit(1);
                        } else {
                            printLog('All redirects were saved successfuly as HTML files.');
                            finished();
                        }
                    });
                }
            });
        }

        function saveArticles(dump, finished) {
            // thoses var will store the list of js and css dependencies for the article we are downloading. they are populated in storeDependencies and used in setFooter
            let jsConfigVars = ''
            let jsDependenciesList = []
            let styleDependenciesList = []

            function parseHtml(html, articleId, finished) {
                try {
                    finished(null, domino.createDocument(html), articleId);
                } catch (error) {
                    console.error('Crash while parsing ' + articleId);
                    console.error(error.stack);
                    process.exit(1);
                }
            }

            function storeDependencies(parsoidDoc, articleId, finished) {
                const filenameRadical = computeFilenameRadical()

                // the encodeURIComponent bellow is mandatory for languages with illegal letters for uri (like fa.wikipedia.org)
                // and the encodeURI is mandatory to encode the pipes '|'
                // but the '&' and '=' must not be encoded
                const articleApiUrl = `${apiUrl}action=parse&format=json&page=${encodeURIComponent(articleId)}&prop=${encodeURI('modules|jsconfigvars|headhtml')}`
                fetch(articleApiUrl, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                })
                    .then(response => response.json())
                    .then(({ parse: { modules, modulescripts, modulestyles, headhtml }}) => {
                        jsDependenciesList = genericJsModules.concat(modules, modulescripts)
                        styleDependenciesList = [].concat(modules, modulestyles, genericCssModules)

                        styleDependenciesList = styleDependenciesList.filter(oneStyleDep => !blackListCssModules.includes(oneStyleDep))

                        printLog(`Js dependencies of ${articleId} : ${jsDependenciesList}`)
                        printLog(`Css dependencies of ${articleId} : ${styleDependenciesList}`)

                        const allDependenciesWithType = [
                            { type: 'js', moduleList: jsDependenciesList },
                            { type: 'css', moduleList: styleDependenciesList }
                        ]

                        allDependenciesWithType.forEach(({ type, moduleList }) => moduleList.forEach(oneModule => downloadAndSaveModule(oneModule, type)))

                        // Saving, as a js module, the jsconfigvars that are set in the header of a wikiepdia page
                        // the script bellow extract the config with a regex executed on the page header returned from the api
                        const scriptTags = domino.createDocument(headhtml['*'] + '</body></html>').getElementsByTagName('script')
                        const regex = /mw\.config\.set\(\{.*?\}\);/mg;
                        for (let i=0; i < scriptTags.length; i++) {
                            if (scriptTags[i].text.includes('mw.config.set')) jsConfigVars = regex.exec(scriptTags[i].text)
                        }
                        jsConfigVars = `(window.RLQ=window.RLQ||[]).push(function() {${jsConfigVars}});`
                        jsConfigVars = jsConfigVars.replace('nosuchaction', 'view') // to replace the wgAction config that is set to 'nosuchaction' from api but should be 'view'
                        try {
                            fs.writeFileSync(pathParser.resolve(htmlRootPath, `${javascriptDirectory}/${jsModulesDirectory}/jsConfigVars.js`), jsConfigVars )
                            printLog(`created dep jsConfigVars.js for article ${articleId}`)
                        } catch (e) {
                            console.error(`Error writing file ${moduleUri}`, e)
                        }

                        finished(null, parsoidDoc, articleId)
                    })
                    .catch(e => {
                        console.log(`Error fetching api.php for ${articleApiUrl}`, e)
                        finished(null, parsoidDoc, articleId) // calling finished here will allow zim generation to continue event if an article doesn't properly get his modules
                    })

                const downloadAndSaveModule = (module, type) => {
                    // param :
                    //   module : string : the name of the module
                    //   moduleUri : string : the path where the module will be saved into the zim
                    //   type : string : either 'js' or 'css'
                    // this function save a key into redis db in the form of module.type -> moduleUri
                    // return :
                    //   a promise resolving 1 if data has been succesfully saved or resolving 0 if data was already in redis
                    const saveModuleInRedis = (module, moduleUri, type) => new Promise((resolve, reject) => {
                        // hsetnx() store in redis only if key doesn't already exists
                        redisClient.hsetnx(redisModuleDatabase, `${dump}_${module}.${type}`, moduleUri, (err, res) => err
                            ? reject(`Error, unable to save module ${module} in redis`)
                            : resolve(res)
                        )
                    })

                    // the 2 variable fonctions bellow are a hack to call startUp() (from module startup) when the 3 generic dependencies (startup, jquery, mediawiki) are loaded.
                    // on wikipedia, startUp() is called in the callback of the call to load.php to dl jquery and mediawiki but since load.php cannot be called in offline,
                    // this hack call startUp() when custom event fireStartUp is receive. Which is dispatched when module mediawki has finished loading
                    const hackStartUpModule = (jsCode) => jsCode.replace("script=document.createElement('script');", `
                        document.body.addEventListener('fireStartUp', function () { startUp() }, false);
                        return;
                        script=document.createElement('script');`
                    )
                    const hackMediaWikiModule = (jsCode) => jsCode += `
                        (function () {
                            var startUpEvent = new CustomEvent('fireStartUp');
                            document.body.dispatchEvent(startUpEvent)
                        })()`

                    let moduleUri
                    let apiParameterOnly
                    if (type === 'js') {
                        moduleUri = pathParser.resolve(htmlRootPath, `${javascriptDirectory}/${jsModulesDirectory}/${module}.js`)
                        apiParameterOnly = 'scripts'
                    } else if (type === 'css') {
                        moduleUri = pathParser.resolve(htmlRootPath, `${styleDirectory}/${styleModulesDirectory}/${module}.css`)
                        apiParameterOnly = 'styles'
                    }

                    const moduleApiUrl = encodeURI(`${mwUrl}w/load.php?debug=false&lang=en&modules=${module}&only=${apiParameterOnly}&skin=vector&version=&*`)
                    saveModuleInRedis(module, moduleUri, type)
                        .then(redisResult => redisResult === 1 &&
                            fetch(moduleApiUrl, {
                                method: 'GET',
                                headers: { 'Accept': 'text/plain' }
                            })
                                .then(response => response.text())
                                .then(text => {
                                    if (module === 'startup' && type === 'js') text = hackStartUpModule(text)
                                    else if (module === 'mediawiki' && type === 'js') text = hackMediaWikiModule(text)

                                    try {
                                        fs.writeFileSync(moduleUri, text)
                                        printLog(`created dep ${module} for article ${articleId}`)
                                    } catch (e) {
                                        console.error(`Error writing file ${moduleUri}`, e)
                                    }
                                })
                                .catch(e => console.error(`Error fetching load.php for ${articleId}`, e))
                        )
                        .catch(e => console.error(e))
                }
            }

            function treatMedias(parsoidDoc, articleId, finished) {
                /* Clean/rewrite image tags */
                var imgs = parsoidDoc.getElementsByTagName('img');
                var videos = Array.from(parsoidDoc.getElementsByTagName('video'));
                var srcCache = new Object();

                videos.forEach(videoEl => {
                    //Worth noting,
                    //Video tags are used for audio files too (as opposed to the audio tag)
                    //When it's only audio there will be a single OGG file
                    //For video we get multiple SOURCE tages with different resolutions

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

                    if (nopic || novid) {
                        deleteNode(videoEl);
                        return;
                    }

                    if(posterUrl) videoEl.setAttribute('poster', newVideoPosterUrl);
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

                    sourcesToRemove.forEach(deleteNode);

                    const sourceEl = videoSources[0]; //Use first source (smallest resolution)
                    const sourceUrl = getFullUrl(sourceEl.getAttribute('src'));
                    const newUrl = getMediaUrl(sourceUrl);

                    if (!newUrl) {
                        deleteNode(sourceEl);
                        return;
                    }

                    /* Download content, but avoid duplicate calls */
                    if (!srcCache.hasOwnProperty(sourceUrl)) {
                        srcCache[sourceUrl] = true;
                        downloadFileQueue.push(sourceUrl);
                    }

                    sourceEl.setAttribute('src', newUrl);
                });

                for (var i = 0; i < imgs.length; i++) {
                    var img = imgs[i];
                    var imageNodeClass = img.getAttribute('class') || '';

                    if ((!nopic ||
                        imageNodeClass.search('mwe-math-fallback-image-inline') >= 0 ||
                        img.getAttribute('typeof') == 'mw:Extension/math'
                    ) &&
                        img.getAttribute('src') &&
                        img.getAttribute('src').indexOf('./Special:FilePath/') != 0
                    ) {

                        /* Remove image link */
                        var linkNode = img.parentNode;
                        if (linkNode.tagName === 'A') {

                            /* Check if the target is mirrored */
                            var href = linkNode.getAttribute('href') || '';
                            var targetId = extractTargetIdFromHref(href);
                            var keepLink = targetId && isMirrored(targetId);

                            /* Under certain condition it seems that this is possible
                             * to have parentNode == undefined, in this case this
                             * seems preferable to remove the whole link+content than
                             * keeping a wrong link. See for example this url
                             * http://parsoid.wmflabs.org/ko/%EC%9D%B4%ED%9C%98%EC%86%8C */
                            if (!keepLink) {
                                if (linkNode.parentNode) {
                                    linkNode.parentNode.replaceChild(img, linkNode);
                                } else {
                                    deleteNode(img);
                                }
                            }
                        }

                        /* Rewrite image src attribute */
                        if (img) {
                            var src = getFullUrl(img.getAttribute('src'));
                            var newSrc = getMediaUrl(src);

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
                                deleteNode(img);
                            }
                        }
                    } else {
                        deleteNode(img);
                    }
                }

                /* Improve image frames */
                var figures = parsoidDoc.getElementsByTagName('figure');
                var spans = parsoidDoc.querySelectorAll("span[typeof=mw:Image/Frameless]");
                var imageNodes = Array.prototype.slice.call(figures).concat(Array.prototype.slice.call(spans));
                for (var i = 0; i < imageNodes.length; i++) {
                    var imageNode = imageNodes[i];
                    var images = imageNode.getElementsByTagName('img');
                    var image = images.length > 0 ? images[0] : undefined;
                    var isStillLinked = image && image.parentNode && image.parentNode.tagName === 'A';

                    if (!nopic && imageNode && image) {
                        var imageNodeClass = imageNode.getAttribute('class') || '';
                        var imageNodeTypeof = imageNode.getAttribute('typeof') || '';

                        if (imageNodeTypeof.indexOf('mw:Image/Thumb') >= 0 || mobileLayout) {
                            var descriptions = imageNode.getElementsByTagName('figcaption')
                            var description = descriptions.length > 0 ? descriptions[0] : undefined;
                            var imageWidth = parseInt(image.getAttribute('width'));

                            var thumbDiv = parsoidDoc.createElement('div');
                            thumbDiv.setAttribute('class', 'thumb');
                            if (imageNodeClass.search('mw-halign-right') >= 0) {
                                thumbDiv.setAttribute('class', concatenateToAttribute(thumbDiv.getAttribute('class'), 'tright'));
                            } else if (imageNodeClass.search('mw-halign-left') >= 0) {
                                thumbDiv.setAttribute('class', concatenateToAttribute(thumbDiv.getAttribute('class'), 'tleft'));
                            } else if (imageNodeClass.search('mw-halign-center') >= 0) {
                                thumbDiv.setAttribute('class', concatenateToAttribute(thumbDiv.getAttribute('class'), 'tnone'));
                                var centerDiv = parsoidDoc.createElement('center');
                                centerDiv.appendChild(thumbDiv);
                                thumbDiv = centerDiv;
                            } else {
                                thumbDiv.setAttribute('class', concatenateToAttribute(thumbDiv.getAttribute('class'), 't' + revAutoAlign));
                            }

                            var thumbinnerDiv = parsoidDoc.createElement('div');
                            thumbinnerDiv.setAttribute('class', 'thumbinner');
                            thumbinnerDiv.setAttribute('style', 'width:' + (imageWidth + 2) + 'px');

                            var thumbcaptionDiv = parsoidDoc.createElement('div');
                            thumbcaptionDiv.setAttribute('class', 'thumbcaption');
                            thumbcaptionDiv.setAttribute('style', 'text-align: ' + autoAlign);
                            if (description) {
                                thumbcaptionDiv.innerHTML = description.innerHTML
                            }

                            thumbinnerDiv.appendChild(isStillLinked ? image.parentNode : image);
                            thumbinnerDiv.appendChild(thumbcaptionDiv);
                            thumbDiv.appendChild(thumbinnerDiv);

                            imageNode.parentNode.replaceChild(thumbDiv, imageNode);
                        } else if (imageNodeTypeof.indexOf('mw:Image') >= 0) {
                            var div = parsoidDoc.createElement('div');
                            if (imageNodeClass.search('mw-halign-right') >= 0) {
                                div.setAttribute('class', concatenateToAttribute(div.getAttribute('class'), 'floatright'));
                            } else if (imageNodeClass.search('mw-halign-left') >= 0) {
                                div.setAttribute('class', concatenateToAttribute(div.getAttribute('class'), 'floatleft'));
                            } else if (imageNodeClass.search('mw-halign-center') >= 0) {
                                div.setAttribute('class', concatenateToAttribute(div.getAttribute('class'), 'center'));
                            }
                            div.appendChild(isStillLinked ? image.parentNode : image);
                            imageNode.parentNode.replaceChild(div, imageNode);
                        }
                    } else {
                        deleteNode(imageNode);
                    }
                }

                finished(null, parsoidDoc, articleId);
            }

            function rewriteUrls(parsoidDoc, articleId, finished) {
                /* Go through all links */
                var as = parsoidDoc.getElementsByTagName('a');
                var areas = parsoidDoc.getElementsByTagName('area');
                var linkNodes = Array.prototype.slice.call(as).concat(Array.prototype.slice.call(areas));

                function rewriteUrl(linkNode, finished) {
                    var rel = linkNode.getAttribute('rel');
                    var href = linkNode.getAttribute('href') || '';

                    if (!href) {
                        deleteNode(linkNode);
                        finished();
                    } else {

                        /* Deal with custom geo. URL replacement, for example:
                         * http://maps.wikivoyage-ev.org/w/poimap2.php?lat=44.5044943&lon=34.1969633&zoom=15&layer=M&lang=ru&name=%D0%9C%D0%B0%D1%81%D1%81%D0%B0%D0%BD%D0%B4%D1%80%D0%B0
                         * http://tools.wmflabs.org/geohack/geohack.php?language=fr&pagename=Tour_Eiffel&params=48.85825_N_2.2945_E_type:landmark_region:fr
                         */
                        if (rel != 'mw:WikiLink') {
                            var lat, lon;
                            if (/poimap2\.php/i.test(href)) {
                                var hrefQuery = urlParser.parse(href, true).query;
                                lat = parseFloat(hrefQuery.lat);
                                lon = parseFloat(hrefQuery.lon);
                            } else if (/geohack\.php/i.test(href)) {
                                var params = urlParser.parse(href, true).query.params;

                                /* "params" might be an array, try to detect the geo localization one */
                                if (params instanceof Array) {
                                    var i = 0;
                                    while (params[i] && isNaN(params[i][0])) {
                                        i++
                                    };
                                    params = params[i];
                                }

                                if (params) {
                                    // see https://bitbucket.org/magnusmanske/geohack/src public_html geo_param.php
                                    var pieces = params.toUpperCase().split('_');
                                    var semiPieces = pieces.length > 0 ? pieces[0].split(';') : undefined;
                                    if (semiPieces && semiPieces.length == 2) {
                                        lat = semiPieces[0];
                                        lon = semiPieces[1];
                                    } else {
                                        var factors = [1, 60, 3600];
                                        var offs = 0;

                                        var deg = function (hemiHash) {
                                            var out = 0;
                                            for (var i = 0; i < 4 && (i + offs) < pieces.length; i++) {
                                                var v = pieces[i + offs];
                                                var hemiSign = hemiHash[v];
                                                if (hemiSign) {
                                                    offs = i + 1;
                                                    break;
                                                }
                                                out += v / factors[i];
                                            }
                                            return out * hemiSign;
                                        }

                                        lat = deg({N:1, S:-1});
                                        lon = deg({E:1, W:-1, O:1});
                                    }
                                }
                            } else if (/Special:Map/i.test(href)) {
                                var parts = href.split('/');
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
                            if (rel.substring(0, 10) === 'mw:ExtLink' ||
                                rel === 'mw:WikiLink/Interwiki') {
                                linkNode.setAttribute('class', concatenateToAttribute(linkNode.getAttribute('class'), 'external'));
                            }

                            /* Check if the link is "valid" */
                            if (!href) {
                                console.error('No href attribute in the following code, in article ' + articleId);
                                console.error(linkNode.outerHTML);
                                process.exit(1);
                            }

                            /* Rewrite external links starting with // */
                            if (rel.substring(0, 10) === 'mw:ExtLink' || rel == 'nofollow') {
                                if (href.substring(0, 1) === '/') {
                                    linkNode.setAttribute('href', getFullUrl(href));
                                } else if (href.substring(0, 2) === './') {
                                    while (linkNode.firstChild) {
                                        linkNode.parentNode.insertBefore(linkNode.firstChild, linkNode);
                                    }
                                    linkNode.parentNode.removeChild(linkNode);
                                }
                                finished();
                            }

                            /* Remove internal links pointing to no mirrored articles */
                            else if (rel == 'mw:WikiLink') {
                                var targetId = extractTargetIdFromHref(href);

                                /* Deal with local anchor */
                                var localAnchor = '';
                                if (targetId.lastIndexOf("#") != -1) {
                                    localAnchor = targetId.substr(targetId.lastIndexOf('#'));
                                    targetId = targetId.substr(0, targetId.lastIndexOf('#'));
                                }

                                if (isMirrored(targetId)) {
                                    linkNode.setAttribute('href', getArticleUrl(targetId) + localAnchor);
                                    finished();
                                } else {
                                    try {
                                        redisClient.hexists(redisRedirectsDatabase, targetId, function (error, res) {
                                            if (error) {
                                                console.error('Unable to check redirect existence with redis: ' + error);
                                                process.exit(1);
                                            } else {
                                                if (res) {
                                                    linkNode.setAttribute('href', getArticleUrl(targetId));
                                                } else {
                                                    while (linkNode.firstChild) {
                                                        linkNode.parentNode.insertBefore(linkNode.firstChild, linkNode);
                                                    }
                                                    linkNode.parentNode.removeChild(linkNode);
                                                }
                                            }
                                            finished();
                                        });
                                    } catch (error) {
                                        console.error("Exception by requesting redis " + error);
                                        process.exit(1);
                                    }
                                }
                            } else {
                                finished();
                            }
                        } else {
                            var targetId = extractTargetIdFromHref(href);
                            if (targetId) {
                                if (isMirrored(targetId)) {
                                    linkNode.setAttribute('href', getArticleUrl(targetId));
                                    finished();
                                } else {
                                    redisClient.hexists(redisRedirectsDatabase, targetId, function (error, res) {
                                        if (error) {
                                            console.error('Unable to check redirect existence with redis: ' + error);
                                            process.exit(1);
                                        } else {
                                            if (res) {
                                                linkNode.setAttribute('href', getArticleUrl(targetId));
                                            } else {
                                                while (linkNode.firstChild) {
                                                    linkNode.parentNode.insertBefore(linkNode.firstChild, linkNode);
                                                }
                                                linkNode.parentNode.removeChild(linkNode);
                                            }
                                        }
                                        finished();
                                    });
                                }
                            } else {
                                finished();
                            }
                        }
                    }
                }

                async.eachLimit(linkNodes, speed, rewriteUrl, function (error) {
                    if (error) {
                        console.error('Problem by rewriting urls: ' + error);
                        process.exit(1);
                    } else {
                        finished(null, parsoidDoc, articleId);
                    }
                });
            }

            function applyOtherTreatments(parsoidDoc, articleId, finished) {
                /* Go through gallerybox */
                var galleryboxes = parsoidDoc.getElementsByClassName('gallerybox');
                for (var i = 0; i < galleryboxes.length; i++) {
                    if ((!galleryboxes[i].getElementsByClassName('thumb').length) || (nopic)) {
                        deleteNode(galleryboxes[i]);
                    }
                }

                /* Remove "map" tags if necessary */
                if (nopic) {
                    var maps = parsoidDoc.getElementsByTagName('map');
                    for (var i = 0; i < maps.length; i++) {
                        deleteNode(maps[i]);
                    }
                }

                /* Go through all reference calls */
                var spans = parsoidDoc.getElementsByTagName('span');
                for (var i = 0; i < spans.length; i++) {
                    var span = spans[i];
                    var rel = span.getAttribute('rel');
                    if (rel === 'dc:references') {
                        var sup = parsoidDoc.createElement('sup');
                        if (span.innerHTML) {
                            sup.id = span.id;
                            sup.innerHTML = span.innerHTML;
                            span.parentNode.replaceChild(sup, span);
                        } else {
                            deleteNode(span);
                        }
                    }
                }

                /* Remove element with id in the blacklist */
                idBlackList.map(function (id) {
                    var node = parsoidDoc.getElementById(id);
                    if (node) {
                        deleteNode(node);
                    }
                });

                /* Remove element with black listed CSS classes */
                cssClassBlackList.map(function (classname) {
                    var nodes = parsoidDoc.getElementsByClassName(classname);
                    for (var i = 0; i < nodes.length; i++) {
                        deleteNode(nodes[i]);
                    }
                });

                /* Remove element with black listed CSS classes and no link */
                cssClassBlackListIfNoLink.map(function (classname) {
                    var nodes = parsoidDoc.getElementsByClassName(classname);
                    for (var i = 0; i < nodes.length; i++) {
                        if (nodes[i].getElementsByTagName('a').length === 0) {
                            deleteNode(nodes[i]);
                        }
                    }
                });

                /* Force display of element with that CSS class */
                cssClassDisplayList.map(function (classname) {
                    var nodes = parsoidDoc.getElementsByClassName(classname);
                    for (var i = 0; i < nodes.length; i++) {
                        nodes[i].style.removeProperty('display');
                    }
                });

                /* Remove link tags */
                var links = parsoidDoc.getElementsByTagName('link');
                for (var i = 0; i < links.length; i++) {
                    deleteNode(links[i]);
                };

                /* Remove useless DOM nodes without children */
                var tagNames = ['li', 'span'];
                tagNames.map(function (tagName) {
                    var nodes = parsoidDoc.getElementsByTagName(tagName);
                    for (var i = 0; i < nodes.length; i++) {
                        if (!nodes[i].innerHTML) {
                            deleteNode(nodes[i]);
                        }
                    };
                });

                /* Remove useless input nodes */
                var inputNodes = parsoidDoc.getElementsByTagName('input');
                for (var i = 0; i < inputNodes.length; i++) {
                    deleteNode(inputNodes[i]);
                };

                /* Remove empty paragraphs */
                if (!keepEmptyParagraphs) {
                    for (var level = 5; level > 0; level--) {
                        var paragraphNodes = parsoidDoc.getElementsByTagName('h' + level);
                        for (var i = 0; i < paragraphNodes.length; i++) {
                            var paragraphNode = paragraphNodes[i];
                            var nextElementNode = getNextSiblingElement(paragraphNode);

                            /* No nodes */
                            if (!nextElementNode) {
                                deleteNode(paragraphNode);
                            } else {

                                /* Delete if nextElementNode is a paragraph with <= level */
                                var nextElementNodeTag = nextElementNode.tagName.toLowerCase();
                                if (nextElementNodeTag.length > 1 && nextElementNodeTag[0] == 'h' &&
                                    !isNaN(nextElementNodeTag[1]) && nextElementNodeTag[1] <= level) {
                                    deleteNode(paragraphNode);
                                }
                            }
                        }
                    }
                }

                /* Clean the DOM of all uncessary code */
                var allNodes = parsoidDoc.getElementsByTagName('*');
                for (var i = 0; i < allNodes.length; i++) {
                    var node = allNodes[i];
                    node.removeAttribute('data-parsoid');
                    node.removeAttribute('typeof');
                    node.removeAttribute('about');
                    node.removeAttribute('data-mw');

                    if (node.getAttribute('rel') && node.getAttribute('rel').substr(0, 3) === 'mw:') {
                        node.removeAttribute('rel');
                    }

                    /* Remove a few css calls */
                    cssClassCallsBlackList.map(function (classname) {
                        if (node.getAttribute('class')) {
                            node.setAttribute('class', node.getAttribute('class').replace(classname, ''));
                        }
                    });
                }

                finished(null, parsoidDoc, articleId);
            }

            function setFooter(parsoidDoc, articleId, finished) {
                const htmlTemplateDoc = domino.createDocument(
                    (mobileLayout ? htmlMobileTemplateCode : htmlDesktopTemplateCode)
                        .replace('__ARTICLE_CONFIGVARS_LIST__', jsConfigVars !== ''
                            ? `<script src="${javascriptDirectory}/${jsModulesDirectory}/jsConfigVars.js"></script>`
                            : ''
                        )
                        .replace('__ARTICLE_JS_LIST__', jsDependenciesList.length !== 0
                            ? jsDependenciesList.map(oneJsDep => `<script src="${javascriptDirectory}/${jsModulesDirectory}/${oneJsDep}.js"></script>`).join('\n')
                            : ''
                        )
                        .replace('__ARTICLE_CSS_LIST__', styleDependenciesList.length !== 0
                            ? styleDependenciesList.map(oneCssDep => `<link href="${styleDirectory}/${styleModulesDirectory}/${oneCssDep}.css" rel="stylesheet" type="text/css" />`).join('\n')
                            : ''
                        )
                )

                /* Create final document by merging template and parsoid documents */
                htmlTemplateDoc.getElementById('mw-content-text').innerHTML = parsoidDoc.getElementsByTagName('body')[0].innerHTML;
                if (!mobileLayout)
                    htmlTemplateDoc.getElementsByTagName('title')[0].innerHTML =
                        parsoidDoc.getElementsByTagName('title') ? parsoidDoc.getElementsByTagName('title')[0].innerHTML.replace(/_/g, ' ') : articleId.replace(/_/g, ' ');
                if (mainPageId != articleId) {
                    htmlTemplateDoc.getElementById('titleHeading').innerHTML = htmlTemplateDoc.getElementsByTagName('title')[0].innerHTML;
                } else {
                    deleteNode(htmlTemplateDoc.getElementById('titleHeading'));
                }

                /* Subpage */
                if (isSubpage(articleId) && mainPageId != articleId) {
                    var contentNode = htmlTemplateDoc.getElementById('content');
                    var headingNode = htmlTemplateDoc.getElementById('mw-content-text');
                    var subpagesNode = htmlTemplateDoc.createElement('span');
                    var parents = articleId.split('/'); parents.pop();
                    var subpages = '';
                    var parentPath = '';
                    parents.map(function (parent) {
                        var label = parent.replace(/_/g, ' ');
                        var isParentMirrored = isMirrored(parentPath + parent);
                        subpages += '&lt; ' + (isParentMirrored ? '<a href="' + getArticleUrl(parentPath + parent) + '" title="' + label + '">' : '')
                            + label + (isParentMirrored ? '</a> ' : ' ');
                        parentPath += parent + '/';
                    });
                    subpagesNode.innerHTML = subpages;
                    subpagesNode.setAttribute('class', 'subpages');
                    contentNode.insertBefore(subpagesNode, headingNode);
                }

                /* Set footer */
                var div = htmlTemplateDoc.createElement('div');
                var oldId = articleIds[articleId];
                redisClient.hget(redisArticleDetailsDatabase, articleId, function (error, detailsJson) {
                    if (error) {
                        finished('Unable to get the details from redis for article ' + articleId + ': ' + error);
                    } else {

                        /* Is seems that sporadically this goes wrong */
                        var details = JSON.parse(detailsJson);

                        /* Revision date */
                        var timestamp = details['t'];
                        var date = new Date(timestamp * 1000);
                        div.innerHTML = footerTemplate({ articleId: encodeURIComponent(articleId), webUrl: webUrl, creator: creator, oldId: oldId, date: date.toISOString().substring(0, 10) });
                        htmlTemplateDoc.getElementById('mw-content-text').appendChild(div);
                        addNoIndexCommentToElement(div);

                        /* Geo-coordinates */
                        var geoCoordinates = details['g'];
                        if (geoCoordinates) {
                            var metaNode = htmlTemplateDoc.createElement('meta');
                            metaNode.name = 'geo.position';
                            metaNode.content = geoCoordinates // latitude + ';' + longitude;
                            htmlTemplateDoc.getElementsByTagName('head')[0].appendChild(metaNode);
                        }

                        finished(null, htmlTemplateDoc, articleId);
                    }
                });
            }

            function writeArticle(doc, articleId, finished) {
                printLog('Saving article ' + articleId + '...');
                var html = doc.documentElement.outerHTML;

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

                if (deflateTmpHtml) {
                    zlib.deflate(html, function (error, deflatedHtml) {
                        fs.writeFile(getArticlePath(articleId), deflatedHtml, finished);
                    });
                } else {
                    fs.writeFile(getArticlePath(articleId), html, finished);
                }
            }

            function saveArticle(articleId, finished) {
                var articleUrl = parsoidUrl + encodeURIComponent( articleId ) + ( parsoidUrl.indexOf( '/rest' ) < 0 ? (parsoidUrl.indexOf( '?' ) < 0 ? '?' : '&' ) + 'oldid=' : '/' ) + articleIds[ articleId ];
                printLog( 'Getting article from ' + articleUrl );
                let html = ''
                if (mobileLayout && mainPageId !== articleId) {
                    const articleApiUrl = `${mwUrl}api/rest_v1/page/mobile-sections/${encodeURIComponent(articleId)}`
                    fetch(articleApiUrl, {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' }
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
                            </div>`

                            // set all other section (closed by default)
                            json.remaining.sections.forEach((oneSection, i) => {
                                // if bellow is to test if we need to nest a subsections into a section
                                if (oneSection.toclevel === 1) {
                                    html = html.replace(`__SUB_LEVEL_SECTION_${oneSection.id - 1}__`, '') // remove unused anchor for subsection
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
                                </div>`
                                } else {
                                    html = html.replace(`__SUB_LEVEL_SECTION_${oneSection.id - 1}__`, `
                                    <h${oneSection.toclevel + 1}
                                        class="section-heading in-block collapsible-heading open-block" tabindex="0" aria-haspopup="true" aria-controls="content-collapsible-block-${i + 1}"
                                    >
                                        <span class="mw-headline" id="${oneSection.anchor}">${oneSection.line}</span>
                                    </h${oneSection.toclevel + 1}>
                                    <div id="mf-section-${oneSection.id}" class="mf-section-${oneSection.id} collapsible-block open-block" id="content-collapsible-block-0" aria-pressed="true" aria-expanded="true">
                                        ${oneSection.text}
                                    </div>
                                    __SUB_LEVEL_SECTION_${oneSection.id}__
                                `)
                                }
                            })
                            html = html.replace(`__SUB_LEVEL_SECTION_${json.remaining.sections.length}__`, '') // remove the last subcestion anchor (all other anchor are removed in the forEach)

                            buildArticleFromApiData()
                        })
                        .catch(e => {
                            console.error('Error handling json response from api. ', e)
                            buildArticleFromApiData()
                        })
                } else {
                    setTimeout(skipHtmlCache || articleId == mainPageId ? downloadContent : downloadContentAndCache, downloadFileQueue.length() + optimizationQueue.length(), articleUrl, function(content, responseHeaders, articleId) {
                        let json;
                        if (parsoidContentType == 'json') {
                            try {
                                json = JSON.parse( content.toString() );
                            } catch (e) {
                                //TODO: Figure out why this is happening
                                html = content.toString();
                                console.error(e);
                            }
                            if (json && json['visualeditor']) {
                                html = json['visualeditor']['content'];
                            } else if (json && json.contentmodel === 'wikitext') {
                                html = json['html']['body'];
                            } else if (json && json.error) {
                                console.error('Error by retrieving article: ' + json['error']['info']);
                            } else {
                                html = content.toString();
                            }
                        } else {
                            html = content.toString();
                        }
                        buildArticleFromApiData()
                    }, articleId );
                }

                function buildArticleFromApiData () {
                    if ( html ) {
                        var articlePath = getArticlePath( articleId );
                        var prepareAndSaveArticle = async.compose( writeArticle, setFooter, applyOtherTreatments, rewriteUrls, treatMedias, storeDependencies, parseHtml );

                        printLog( 'Treating and saving article ' + articleId + ' at ' + articlePath + '...' );
                        prepareAndSaveArticle( html, articleId, function ( error, result ) {
                            if ( error ) {
                                console.error( 'Error by preparing and saving file ' + error );
                                process.exit( 1 );
                            } else {
                                printLog( 'Dumped successfully article ' + articleId );
                                finished();
                            }
                        });
                    } else {
                        delete articleIds[ articleId ];
                        finished();
                    }
                }
            }

            printLog('Saving articles...');
            async.eachLimit(Object.keys(articleIds), speed, saveArticle, function (error) {
                if (error) {
                    console.error('Unable to retrieve an article correctly: ' + error);
                    process.exit(1);
                } else {
                    printLog('All articles were retrieved and saved.');
                    finished();
                }
            });
        }

        function addNoIndexCommentToElement(element) {
            var slices = element.parentElement.innerHTML.split(element.outerHTML);
            element.parentElement.innerHTML = slices[0] + "<!--htdig_noindex-->" + element.outerHTML + "<!--/htdig_noindex-->" + slices[1];
        }

        function isMirrored(id) {
            if (!articleList && id && id.indexOf(':') >= 0) {
                var namespace = namespaces[id.substring(0, id.indexOf(':')).replace(/ /g, spaceDelimiter)];
                if (namespace != undefined) {
                    return namespace.isContent
                }
            }
            return (id in articleIds);
        }

        function isSubpage(id) {
            if (id && id.indexOf('/') >= 0) {
                var namespace = id.indexOf(':') >= 0 ? id.substring(0, id.indexOf(':')).replace(/ /g, spaceDelimiter) : "";
                var namespace = namespaces[namespace];
                if (namespace != undefined) {
                    return namespace.allowedSubpages;
                }
            }
            return false;
        }

        /* Grab and concatenate stylesheet files */
        function saveStylesheet(finished) {
            printLog('Dumping stylesheets...');
            var urlCache = new Object();
            var stylePath = htmlRootPath + styleDirectory + '/style.css';

            /* Remove if exists */
            fs.unlink(stylePath, function () { });

            /* Take care to download medias */
            var downloadCSSFileQueue = async.queue(function (data, finished) {
                if (data.url && data.path) {
                    downloadFile(data.url, data.path, true, finished);
                } else {
                    finished();
                }
            }, speed);

            /* Take care to download CSS files */
            var downloadCSSQueue = async.queue(function (link, finished) {

                /* link might be a 'link' DOM node or an URL */
                var cssUrl = typeof link == 'object' ? getFullUrl(link.getAttribute('href')) : link;
                var linkMedia = typeof link == 'object' ? link.getAttribute('media') : null;

                if (cssUrl) {
                    var cssUrlRegexp = new RegExp('url\\([\'"]{0,1}(.+?)[\'"]{0,1}\\)', 'gi');
                    var cssDataUrlRegex = new RegExp('^data');

                    printLog('Downloading CSS from ' + decodeURI(cssUrl));
                    downloadContent(cssUrl, function (content, responseHeaders) {
                        var body = content.toString();

                        var rewrittenCss = '\n/* start ' + cssUrl + ' */\n\n';
                        rewrittenCss += linkMedia ? '@media ' + linkMedia + '  {\n' : '\n';
                        rewrittenCss += body + '\n';
                        rewrittenCss += linkMedia ? '} /* @media ' + linkMedia + ' */\n' : '\n';
                        rewrittenCss += '\n/* end   ' + cssUrl + ' */\n';

                        /* Downloading CSS dependencies */
                        var match;
                        while (match = cssUrlRegexp.exec(body)) {
                            var url = match[1];

                            /* Avoid 'data', so no url dependency */
                            if (!url.match('^data')) {
                                var filename = pathParser.basename(urlParser.parse(url, false, true).pathname);

                                /* Rewrite the CSS */
                                rewrittenCss = rewrittenCss.replace(url, filename);

                                /* Need a rewrite if url doesn't include protocol */
                                url = getFullUrl(url, cssUrl);
                                url = url.indexOf('%') < 0 ? encodeURI(url) : url;

                                /* Download CSS dependency, but avoid duplicate calls */
                                if (!urlCache.hasOwnProperty(url) && filename) {
                                    urlCache[url] = true;
                                    downloadCSSFileQueue.push({ url: url, path: htmlRootPath + styleDirectory + '/' + filename });
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
            downloadContentAndCache(webUrl, function (content, responseHeaders) {
                var html = content.toString();
                var doc = domino.createDocument(html);
                var links = doc.getElementsByTagName('link');

                /* Go through all CSS links */
                for (var i = 0; i < links.length; i++) {
                    var link = links[i];
                    if (link.getAttribute('rel') === 'stylesheet') {
                        downloadCSSQueue.push(link);
                    }
                }

                /* Push Mediawiki:Offline.css ( at the end) */
                downloadCSSQueue.push(webUrl + 'Mediawiki:offline.css?action=raw');

                /* Set the drain method to be called one time everything is done */
                downloadCSSQueue.drain = function (error) {
                    if (error) {
                        console.error('Error by CSS dependencies: ' + error);
                        process.exit(1);
                    } else {
                        var drainBackup = downloadCSSQueue.drain;
                        downloadCSSFileQueue.drain = function (error) {
                            if (error) {
                                console.error('Error by CSS medias: ' + error);
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
        var redirectQueue = async.queue(function (articleId, finished) {
            if (articleId) {
                printLog('Getting redirects for article ' + articleId + '...');
                var url = apiUrl + 'action=query&list=backlinks&blfilterredir=redirects&bllimit=max&format=json&bltitle=' + encodeURIComponent(articleId) + '&rawcontinue=';
                downloadContent(url, function (content, responseHeaders) {
                    var body = content.toString();
                    try {
                        if (!JSON.parse(body)['error']) {
                            var redirects = new Object();
                            var redirectsCount = 0;
                            JSON.parse(body)['query']['backlinks'].map(function (entry) {
                                var title = entry['title'].replace(/ /g, spaceDelimiter)
                                redirects[title] = articleId;
                                redirectsCount++;

                                if (title == mainPageId) {
                                    mainPageId = articleId;
                                }
                            });
                            printLog(redirectsCount + ' redirect(s) found for ' + articleId);
                            if (redirectsCount) {
                                redisClient.hmset(redisRedirectsDatabase, redirects, function (error) {
                                    if (error) {
                                        console.error('Unable to set redirects: ' + error);
                                        process.exit(1);
                                    } else {
                                        finished();
                                    }
                                });
                            } else {
                                finished();
                            }
                        } else {
                            finished(JSON.parse(body)['error']);
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
                redirectQueue.drain = function (error) {
                    if (error) {
                        console.error('Unable to retrieve redirects for an article: ' + error);
                        process.exit(1);
                    } else {
                        printLog('All redirect ids retrieve successfuly.');
                        finished();
                    }
                };
                redirectQueue.push('');
            }

            /* Parse article list given by API */
            function parseJson(body) {
                var next = '';
                var json = JSON.parse(body);
                var entries = json['query'] && json['query']['pages'];

                if (entries) {
                    var redirectQueueValues = new Array();
                    var details = new Object();
                    Object.keys(entries).map(function (key) {
                        var entry = entries[key];
                        entry['title'] = entry['title'].replace(/ /g, spaceDelimiter);

                        if ('missing' in entry) {
                            console.error('Article ' + entry['title'] + ' is not available on this wiki.');
                            delete articleIds[entry['title']];
                        } else {
                            redirectQueueValues.push(entry['title']);

                            if (entry['revisions']) {

                                /* Get last revision id */
                                articleIds[entry['title']] = entry['revisions'][0]['revid'];

                                /* Get last revision id timestamp */
                                var articleDetails = { 't': parseInt(new Date(entry['revisions'][0]['timestamp']).getTime() / 1000) };

                                /* Get article geo coordinates */
                                if (entry['coordinates']) {
                                    articleDetails['g'] = entry['coordinates'][0]['lat'] + ';' + entry['coordinates'][0]['lon'];
                                }

                                /* Save as JSON string */
                                details[entry['title']] = JSON.stringify(articleDetails);
                            } else if (entry['pageid']) {
                                printLog('Unable to get revisions for ' + entry['title'] + ', but entry exists in the database. Article was probably deleted meanwhile.');
                                delete articleIds[entry['title']];
                            } else {
                                console.error('Unable to get revisions for ' + entry['title']);
                                console.error('JSON was ' + body);
                                process.exit(1);
                            }
                        }
                    });

                    if (redirectQueueValues.length)
                        redirectQueue.push(redirectQueueValues);
                    if (Object.keys(details).length) {
                        redisClient.hmset(redisArticleDetailsDatabase, details, function (error) {
                            if (error) {
                                console.error('Unable to save article detail information to redis: ' + error);
                                process.exit(1);
                            }
                        });
                    }
                }

                /* Get continue parameters from 'query-continue',
                 * unfortunately old MW version does not use the same way
                 * than recent */
                var continueHash = json['query-continue'] && json['query-continue']['allpages'];
                if (continueHash) {
                    for (var key in continueHash) {
                        next += '&' + key + '=' + encodeURIComponent(continueHash[key]);
                    }
                }

                return next;
            }

            /* Get ids from file */
            function getArticleIdsForLine(line, finished) {
                if (line) {
                    var title = line.replace(/ /g, spaceDelimiter).replace('\r', '');

                    var url = apiUrl + 'action=query&redirects&format=json&prop=revisions|coordinates&titles=' + encodeURIComponent(title);
                    setTimeout(downloadContent, redirectQueue.length() > 30000 ? redirectQueue.length() - 30000 : 0, url, function (content, responseHeaders) {
                        var body = content.toString();
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
                try {
                    var lines = fs.readFileSync(articleList).toString().split('\n');
                } catch (error) {
                    console.error('Unable to open article list file: ' + error);
                    process.exit(1);
                }

                async.eachLimit(lines, speed, getArticleIdsForLine, function (error) {
                    if (error) {
                        console.error('Unable to get all article ids for a file: ' + error);
                        process.exit(1);
                    } else {
                        printLog('List of article ids to mirror completed');
                        drainRedirectQueue(finished);
                    }
                });
            }

            /* Get ids from Mediawiki API */
            function getArticleIdsForNamespace(namespace, finished) {
                var next = '';

                async.doWhilst(
                    function (finished) {
                        printLog('Getting article ids for namespace "' + namespace + '" ' + (next != '' ? ' (from ' + (namespace ? namespace + ':' : '') + next.split('=')[1] + ')' : '') + '...');
                        var url = apiUrl + 'action=query&generator=allpages&gapfilterredir=nonredirects&gaplimit=max&colimit=max&prop=revisions|coordinates&gapnamespace=' + namespaces[namespace].number + '&format=json' + '&rawcontinue=' + next;
                        setTimeout(downloadContent, redirectQueue.length() > 30000 ? redirectQueue.length() - 30000 : 0, url, function (content, responseHeaders) {
                            var body = content.toString();
                            if (body && body.length > 1) {
                                next = parseJson(body);
                                finished();
                            } else {
                                next = '';
                                finished('Error by retrieving ' + url);
                            }
                        });
                    },
                    function () { return next },
                    function (error) {
                        if (error) {
                            console.error('Unable to download article ids: ' + error);
                            process.exit(1);
                        } else {
                            printLog('List of article ids to mirror completed for namespace "' + namespace + '"');
                            finished();
                        }
                    }
                );
            }

            function getArticleIdsForNamespaces() {
                async.eachLimit(namespacesToMirror, namespacesToMirror.length, getArticleIdsForNamespace, function (error) {
                    if (error) {
                        console.error('Unable to get all article ids for in a namespace: ' + error);
                        process.exit(1);
                    } else {
                        printLog('All articles ids (but without redirect ids) for all namespaces were successfuly retrieved.');
                        drainRedirectQueue(finished);
                    }
                });
            }

            /* Get list of article ids */
            async.series(
                [
                    function (finished) { getArticleIdsForLine(mainPageId, finished) },
                    function (finished) {
                        if (articleList) {
                            getArticleIdsForFile(finished);
                        } else {
                            getArticleIdsForNamespaces(finished)
                        }
                    },
                    function (finished) {
                        if (articleList) {
                            finished()
                        } else {
                            if (!isMirrored(mainPageId)) {
                                getArticleIdsForLine(mainPageId, finished)
                            } else {
                                finished();
                            }
                        }
                    }
                ],
                function (error) {
                    if (error) {
                        console.error('Unable retrive article ids: ' + error);
                        process.exit(1);
                    } else {
                        finished();
                    }
                }
            );
        }

        /* Create directories for static files */
        function createSubDirectories(finished) {
            printLog('Creating sub directories at \"' + htmlRootPath + '\"...');
            async.series(
                [
                    function (finished) { exec('rm -rf \"' + htmlRootPath + '\"', finished) },
                    function (finished) { fs.mkdir(htmlRootPath, undefined, finished) },
                    function (finished) { fs.mkdir(htmlRootPath + styleDirectory, undefined, finished) },
                    function (finished) { fs.mkdir(htmlRootPath + styleDirectory + '/' + styleModulesDirectory, undefined, finished) },
                    function (finished) { fs.mkdir(htmlRootPath + mediaDirectory, undefined, finished) },
                    function (finished) { fs.mkdir(htmlRootPath + javascriptDirectory, undefined, finished) },
                    function (finished) { fs.mkdir(htmlRootPath + javascriptDirectory + '/' + jsModulesDirectory, undefined, finished) },
                ],
                function (error) {
                    if (error) {
                        console.error('Unable to create mandatory directories : ' + error);
                        process.exit(1);
                    } else {
                        finished();
                    }
                }
            );
        }

        /* Multiple developer friendly functions */
        function getFullUrl(url, baseUrl) {
            var urlObject = urlParser.parse(url, false, true);

            if (!urlObject.protocol) {

                var baseUrlObject = baseUrl ? urlParser.parse(baseUrl, false, true) : {};
                urlObject.protocol = urlObject.protocol || baseUrlObject.protocol || 'http:';
                urlObject.host = urlObject.host || baseUrlObject.host || webUrlHost;

                /* Relative path */
                if (urlObject.pathname && urlObject.pathname.indexOf('/') != 0 && baseUrlObject.pathname) {
                    urlObject.pathname = pathParser.dirname(baseUrlObject.pathname) + '/' + urlObject.pathname;
                }

                url = urlParser.format(urlObject);
            }

            return url;
        }

        function deleteNode(node) {
            if (node.parentNode) {
                node.parentNode.removeChild(node);
            } else {
                node.outerHTML = '';
            }
            node = undefined;
        }

        function concatenateToAttribute(old, add) {
            return old ? old + ' ' + add : add;
        }

        function downloadContentAndCache(url, callback, var1, var2, var3) {
            var cachePath = cacheDirectory + crypto.createHash('sha1').update(url).digest('hex').substr(0, 20);
            var cacheHeadersPath = cachePath + '.h';

            async.series(
                [
                    function (finished) {
                        fs.readFile(cachePath, function (error, data) {
                            finished(error, error ? undefined : data.toString());
                        })
                    },
                    function (finished) {
                        fs.readFile(cacheHeadersPath, function (error, data) {
                            try {
                                finished(error, error ? undefined : JSON.parse(data.toString()));
                            } catch (error) {
                                finished('Error in downloadContentAndCache() JSON parsing of ' + cacheHeadersPath + ', error is: ' + error);
                            }
                        });
                    }
                ],
                function (error, results) {
                    if (error) {
                        downloadContent(url, function (content, responseHeaders) {
                            printLog('Caching ' + url + ' at ' + cachePath + '...');
                            fs.writeFile(cacheHeadersPath, JSON.stringify(responseHeaders), function (error) {
                                fs.writeFile(cachePath, content, function (error) {
                                    callback(content, responseHeaders, var1, var2, var3);
                                });
                            });
                        });
                    } else {
                        printLog('Cache hit for ' + url + ' (' + cachePath + ')');
                        touch(cachePath, cacheHeadersPath);
                        callback(results[0], results[1], var1, var2, var3);
                    }
                }
            );
        }

        function getRequestOptionsFromUrl(url, compression) {
            var urlObj = urlParser.parse(url);
            var port = urlObj.port ? urlObj.port : (urlObj.protocol && urlObj.protocol.substring(0, 5) == 'https' ? 443 : 80);
            var headers = {
                'accept': 'text/html; charset=utf-8; profile="mediawiki.org/specs/html/1.2.0"',
                'accept-encoding': (compression ? 'gzip, deflate' : ''),
                'cache-control': 'public, max-stale=2678400',
                'user-agent': userAgentString,
                'cookie': loginCookie
            };

            return {
                protocol: urlObj.protocol,
                hostname: urlObj.hostname,
                port: port,
                headers: headers,
                path: urlObj.path,
                method: url.indexOf('action=login') > -1 ? 'POST' : 'GET'
            };
        }

        function downloadContent(url, callback, var1, var2, var3) {
            var retryCount = 0;
            var responseHeaders = {};

            printLog('Downloading ' + decodeURI(url) + '...');
            async.retry(
                3,
                function (finished) {
                    var request;
                    var calledFinished = false;
                    function callFinished(timeout, message, data) {
                        if (!calledFinished) {
                            calledFinished = true;
                            if (message) {
                                console.error(message);
                                request.abort();
                            }
                            request = undefined;
                            setTimeout(finished, timeout, message, data);
                        }
                    }

                    retryCount++;

                    /* Analyse url */
                    var options = getRequestOptionsFromUrl(url, true);

                    /* Protocol detection */
                    var protocol;
                    if (options.protocol == 'http:') {
                        protocol = http;
                    } else if (options.protocol == 'https:') {
                        protocol = https;
                    } else {
                        console.error('Unable to determine the protocol of the following url (' + options.protocol + '), switched back to ' + (webUrlPort == 443 ? 'https' : 'http') + ': ' + url);
                        if (webUrlPort == 443) {
                            protocol = https;
                            url = url.replace(options.protocol, 'https:');
                        } else {
                            protocol = http;
                            url = url.replace(options.protocol, 'http:');
                        }
                        console.error('New url is: ' + url);
                    }

                    /* Downloading */
                    options = getRequestOptionsFromUrl(url, true);
                    request = (protocol).get(options, function (response) {
                        if (response.statusCode == 200) {
                            var chunks = new Array();
                            response.on('data', function (chunk) {
                                chunks.push(chunk);
                            });
                            response.on('end', function () {
                                responseHeaders = response.headers;
                                var encoding = responseHeaders['content-encoding'];
                                if (encoding == 'gzip') {
                                    zlib.gunzip(Buffer.concat(chunks), function (error, decoded) {
                                        callFinished(0, error, decoded && decoded.toString());
                                    });
                                } else if (encoding == 'deflate') {
                                    zlib.inflate(Buffer.concat(chunks), function (error, decoded) {
                                        callFinished(0, error, decoded && decoded.toString());
                                    })
                                } else {
                                    callFinished(0, null, Buffer.concat(chunks));
                                }
                            });
                            response.on('error', function (error) {
                                socket.emit('agentRemove');
                                socket.destroy();
                                callFinished(0, 'Unable to download content [' + retryCount + '] ' + decodeURI(url) + ' (response error: ' + response.statusCode + ').');
                            });
                        } else {
                            response.socket.emit('agentRemove');
                            response.socket.destroy();
                            callFinished(0, 'Unable to download content [' + retryCount + '] ' + decodeURI(url) + ' (statusCode=' + response.statusCode + ').');
                        }
                    });
                    request.on('error', function (error) {
                        callFinished(10000 * retryCount, 'Unable to download content [' + retryCount + '] ' + decodeURI(url) + ' (request error: ' + error + ' ).');
                    });
                    request.on('socket', function (socket) {
                        if (!socket.custom) {
                            socket.custom = true;
                            socket.on('error', function (error) {
                                console.error('Socket timeout');
                                socket.emit('agentRemove');
                                socket.destroy();
                                if (request) { request.emit('error', 'Socket timeout'); }
                            });
                            socket.on('timeout', function (error) {
                                console.error('Socket error');
                                socket.emit('agentRemove');
                                socket.end();
                                if (request) { request.emit('error', 'Socket error'); }
                            });
                        }
                    });
                    request.setTimeout(requestTimeout * 1000 * retryCount);
                    request.end();
                },
                function (error, data) {
                    if (error) {
                        console.error('Absolutly unable to retrieve async. URL: ' + error);

                        /* Unfortunately we can not do that because there are
                         * article which simply will not be parsed correctly by
                         * Parsoid. For example this one
                         * http://parsoid-lb.eqiad.wikimedia.org/dewikivoyage/Via_Jutlandica/Gpx
                         * and this stops the whole dumping process */
                        // process.exit( 1 );
                    }
                    callback(data || new Buffer(0), responseHeaders, var1, var2, var3);
                });
        }

        function downloadFileAndCache(url, callback) {
            var parts = mediaRegex.exec(decodeURI(url));
            var filenameBase = (parts[2].length > parts[5].length ? parts[2] : parts[5] + (parts[6] || ".svg") + (parts[7] || ''));
            var width = parseInt(parts[4].replace(/px\-/g, '')) || INFINITY_WIDTH;

            /* Check if we have already met this image during this dumping process */
            redisClient.hget(redisMediaIdsDatabase, filenameBase, function (error, r_width) {

                /* If no redis entry */
                if (error || !r_width || r_width < width) {

                    /* Set the redis entry if necessary */
                    redisClient.hset(redisMediaIdsDatabase, filenameBase, width, function (error) {
                        if (error) {
                            console.error('Unable to set redis entry for file to download ' + filenameBase + ': ' + error);
                            process.exit(1);
                        } else {
                            var mediaPath = getMediaPath(url);
                            var cachePath = cacheDirectory + 'm/' + crypto.createHash('sha1').update(filenameBase).digest('hex').substr(0, 20) +
                                (pathParser.extname(urlParser.parse(url, false, true).pathname || '') || '');
                            var cacheHeadersPath = cachePath + '.h';
                            var toDownload = false;

                            /* Check if the file exists in the cache */
                            if (fs.existsSync(cacheHeadersPath) && fs.existsSync(cachePath)) {
                                var responseHeaders;
                                try {
                                    responseHeaders = JSON.parse(fs.readFileSync(cacheHeadersPath).toString());
                                } catch (error) {
                                    console.error('Error in downloadFileAndCache() JSON parsing of ' + cacheHeadersPath + ', error is: ' + error);
                                    responseHeaders = undefined;
                                }

                                /* If the cache file width higher than needed, use it. Otherwise download it and erase the cache */
                                if (!responseHeaders || responseHeaders.width < width) {
                                    toDownload = true;
                                } else {
                                    fs.symlink(cachePath, mediaPath, 'file', function (error) {
                                        if (error) {
                                            if (error.code != 'EEXIST') {
                                                console.error('Unable to create symlink to ' + mediaPath + ' at ' + cachePath + ': ' + error);
                                                process.exit(1);
                                            } else if (!skipCacheCleaning) {
                                                touch(cachePath);
                                            }
                                        }

                                        if (!skipCacheCleaning) {
                                            touch(cacheHeadersPath);
                                        }
                                    });
                                    if (responseHeaders.width == width) {
                                        redisClient.hdel(redisCachedMediaToCheckDatabase, filenameBase);
                                    } else {
                                        redisClient.hset(redisCachedMediaToCheckDatabase, filenameBase, width, function (error) {
                                            if (error) {
                                                console.error('Unable to set redis cache media to check ' + filenameBase + ': ' + error);
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
                                downloadFile(url, cachePath, true, function (error, responseHeaders) {
                                    if (error) {
                                        callback();
                                    } else {
                                        printLog('Caching ' + filenameBase + ' at ' + cachePath + '...');
                                        fs.symlink(cachePath, mediaPath, 'file', function (error) {
                                            if (error && error.code != 'EEXIST') {
                                                console.error('Unable to create symlink to ' + mediaPath + ' at ' + cachePath + ': ' + error);
                                                process.exit(1);
                                            }
                                            fs.writeFile(cacheHeadersPath, JSON.stringify({ width: width }), function (error) {
                                                if (error) {
                                                    console.error('Unable to write cache header at ' + cacheHeadersPath + ': ' + error);
                                                    process.exit(1);
                                                }
                                                callback();
                                            });
                                        });
                                    }
                                });
                            } else {
                                printLog('Cache hit for ' + url);
                            }
                        }
                    });
                }

                /* We already have this image with a resolution equal or higher to what we need */
                else {
                    callback();
                }
            });
        }

        function downloadFile(url, path, force, callback) {
            fs.stat(path, function (error, stats) {
                if (error && !force) {
                    if (error.code == 'ENOENT') {
                        printLog(path + ' already downloaded, download will be skipped.');
                        callback();
                    } else {
                        printLog('Impossible to stat() ' + path + ': ' + error);
                        process.exit(1);
                    }
                } else {
                    printLog('Downloading ' + decodeURI(url) + ' at ' + path + '...');
                    downloadContent(url, function (content, responseHeaders) {
                        fs.writeFile(path, content, function (error) {
                            if (error) {
                                console.error('Unable to write ' + path + ' (' + url + ')');
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
            var mediaBase = getMediaBase(url, escape);
            return mediaBase ? htmlRootPath + mediaBase : undefined;
        }

        function getMediaBase(url, escape) {
            var root;

            var parts = mediaRegex.exec(decodeURI(url));
            if (parts) {
                root = parts[2].length > parts[5].length ? parts[2] : parts[5] + (parts[6] || ".svg") + (parts[7] || '');
            }

            if (!root) {
                console.error('Unable to parse media url \"' + url + '\"');
                return;
            }

            function e(string) {
                return (string === undefined ? undefined :
                    escape ? encodeURIComponent(string) : string);
            }

            var filenameFirstVariant = parts[2];
            var filenameSecondVariant = parts[5] + (parts[6] || ".svg") + (parts[7] || '');
            var filename = myDecodeURIComponent(filenameFirstVariant.length > filenameSecondVariant.length ?
                filenameFirstVariant : filenameSecondVariant);

            /* Need to shorten the file due to filesystem limitations */
            if (unicodeCutter.getBinarySize(filename) > 249) {
                var ext = pathParser.extname(filename).split('.')[1] || '';
                var basename = filename.substring(0, filename.length - ext.length - 1) || '';
                filename = unicodeCutter.truncateToBinarySize(basename, 239 - ext.length) + crypto.createHash('md5').update(basename).digest('hex').substring(0, 2) + '.' + ext;
            }

            return mediaDirectory + '/' + e(filename);
        }

        function getArticleUrl(articleId) {
            return getArticleBase(articleId, true);
        }

        function getArticlePath(articleId, escape) {
            return htmlRootPath + getArticleBase(articleId, escape);
        }

        function getArticleBase(articleId, escape) {
            var filename = articleId.replace(/\//g, spaceDelimiter);
            var dirBase = filename.replace(/\./g, spaceDelimiter);

            /* Filesystem is not able to handle with filename > 255 bytes */
            while (Buffer.byteLength(filename, 'utf8') > 250) {
                filename = filename.substr(0, filename.length - 1);
            }

            function e(string) {
                return (string === undefined ? undefined :
                    escape ? encodeURIComponent(string) : string);
            }

            return e(filename) + '.html';
        }

        function getSubTitle(finished) {
            printLog('Getting sub-title...');
            downloadContent(webUrl, function (content, responseHeaders) {
                var html = content.toString();
                var doc = domino.createDocument(html);
                var subTitleNode = doc.getElementById('siteSub');
                subTitle = subTitleNode ? subTitleNode.innerHTML : '';
                finished();
            });
        }

        function getSiteInfo(finished) {
            printLog('Getting web site name...');
            var url = apiUrl + 'action=query&meta=siteinfo&format=json&siprop=general|namespaces|statistics|variables|category|wikidesc';
            downloadContent(url, function (content, responseHeaders) {
                var body = content.toString();
                var entries = JSON.parse(body)['query']['general'];

                /* Welcome page */
                if (!mainPageId && !articleList) {
                    mainPageId = entries['mainpage'].replace(/ /g, spaceDelimiter);
                }

                /* Site name */
                if (!name) {
                    name = entries['sitename'];
                }

                /* Language */
                langIso2 = entries['lang'];
                countryLanguage.getLanguage(langIso2, function (error, language) {
                    if (error || !language.iso639_3) {
                        langIso3 = langIso2;
                    } else {
                        langIso3 = language.iso639_3;
                    }
                    finished();
                });
            });
        }

        function saveFavicon(finished) {
            printLog('Saving favicon.png...');
            var faviconPath = htmlRootPath + 'favicon.png';

            function resizeFavicon(finished) {
                var cmd = 'convert -thumbnail 48 "' + faviconPath + '" "' + faviconPath + '.tmp" ; mv  "' + faviconPath + '.tmp" "' + faviconPath + '" ';
                exec(cmd, function (error, stdout, stderr) {
                    fs.stat(faviconPath, function (error, stats) {
                        optimizationQueue.push({ path: faviconPath, size: stats.size }, function () {
                            finished(error);
                        });
                    });
                }).on('error', function (error) { console.error(error) });
            }

            if (customZimFavicon) {
                var content = fs.readFileSync(customZimFavicon);
                fs.writeFileSync(faviconPath, content);
                resizeFavicon(finished);
            } else {
                downloadContent(apiUrl + 'action=query&meta=siteinfo&format=json', function (content, responseHeaders) {
                    var body = content.toString();
                    var entries = JSON.parse(body)['query']['general'];
                    var logoUrl = entries['logo'];
                    logoUrl = urlParser.parse(logoUrl).protocol ? logoUrl : 'http:' + logoUrl;
                    downloadFile(logoUrl, faviconPath, true, function () {
                        resizeFavicon(finished);
                    });
                });
            }
        }

        function getMainPage(finished) {

            function writeMainPage(html, finished) {
                var mainPagePath = htmlRootPath + 'index.htm';
                if (deflateTmpHtml) {
                    zlib.deflate(html, function (error, deflatedHtml) {
                        fs.writeFile(mainPagePath, deflatedHtml, finished);
                    });
                } else {
                    fs.writeFile(mainPagePath, html, finished);
                }
            }

            function createMainPage(finished) {
                printLog('Creating main page...');
                var doc = domino.createDocument(
                    (mobileLayout ? htmlMobileTemplateCode : htmlDesktopTemplateCode).replace('__ARTICLE_JS_LIST__', '').replace('__ARTICLE_CSS_LIST__', '').replace('__ARTICLE_CONFIGVARS_LIST__', '')
                );
                doc.getElementById('titleHeading').innerHTML = 'Summary';
                doc.getElementsByTagName('title')[0].innerHTML = 'Summary';

                var html = '<ul>\n';
                Object.keys(articleIds).sort().map(function (articleId) {
                    html = html + '<li><a href="' + getArticleBase(articleId, true) + '"\>' + articleId.replace(/_/g, ' ') + '<a></li>\n';
                });
                html = html + '</ul>\n';
                doc.getElementById('mw-content-text').innerHTML = html;

                /* Write the static html file */
                writeMainPage(doc.documentElement.outerHTML, finished);
            }

            function createMainPageRedirect(finished) {
                printLog('Create main page redirection...');
                var html = redirectTemplate({
                    title: mainPageId.replace(/_/g, ' '),
                    target: getArticleBase(mainPageId, true)
                });
                writeMainPage(html, finished);
            }

            if (mainPageId) {
                createMainPageRedirect(finished);
            } else {
                createMainPage(finished);
            }
        }

        function getNamespaces(finished) {
            var url = apiUrl + 'action=query&meta=siteinfo&siprop=namespaces|namespacealiases&format=json';
            downloadContent(url, function (content, responseHeaders) {
                var body = content.toString();
                var types = ['namespaces', 'namespacealiases'];
                types.map(function (type) {
                    var entries = JSON.parse(body)['query'][type];
                    Object.keys(entries).map(function (key) {
                        var entry = entries[key];
                        var name = entry['*'].replace(/ /g, spaceDelimiter);
                        var number = entry['id'];
                        var allowedSubpages = ('subpages' in entry);
                        var isContent = entry['content'] != undefined ? true : false;
                        var canonical = entry['canonical'] ? entry['canonical'].replace(/ /g, spaceDelimiter) : '';
                        var details = { 'number': number, 'allowedSubpages': allowedSubpages, 'isContent': isContent };

                        /* Namespaces in local language */
                        namespaces[lcFirst(name)] = details;
                        namespaces[ucFirst(name)] = details;

                        /* Namespaces in English (if available) */
                        if (canonical) {
                            namespaces[lcFirst(canonical)] = details;
                            namespaces[ucFirst(canonical)] = details;
                        }

                        /* Is content to mirror */
                        if (isContent) {
                            namespacesToMirror.push(name);
                        }
                    });
                });

                finished();
            });
        }

        function getTextDirection(finished) {
            printLog('Getting text direction...');

            downloadContent(webUrl, function (content, responseHeaders) {
                var body = content.toString();
                var doc = domino.createDocument(body);
                var contentNode = doc.getElementById('mw-content-text');
                var languageDirectionRegex = /\"pageLanguageDir\"\:\"(.*?)\"/;
                var parts = languageDirectionRegex.exec(body);
                if (parts && parts[1]) {
                    ltr = (parts[1] === 'ltr');
                } else if (contentNode) {
                    ltr = (contentNode.getAttribute('dir') == 'ltr' ? true : false);
                } else {
                    printLog('Unable to get the language direction, fallback to ltr');
                    ltr = true;
                };

                /* Update alignement values */
                autoAlign = ltr ? 'left' : 'right';
                revAutoAlign = ltr ? 'right' : 'left';

                printLog('Text direction is ' + (ltr ? 'ltr' : 'rtl'));
                finished();
            });
        }

        function lcFirst(str) {
            str += '';
            var f = str.charAt(0).toLowerCase();
            return f + str.substr(1);
        }

        function ucFirst(str) {
            str += '';
            var f = str.charAt(0).toUpperCase();
            return f + str.substr(1);
        }

        function myDecodeURIComponent(uri) {
            try {
                return decodeURIComponent(uri);
            } catch (error) {
                console.error(error);
                return uri;
            }
        }

        function charAt(str, idx) {
            var ret = '';
            str += '';
            var end = str.length;

            var surrogatePairs = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
            while ((surrogatePairs.exec(str)) != null) {
                var li = surrogatePairs.lastIndex;
                if (li - 2 < idx) {
                    idx++;
                } else {
                    break;
                }
            }

            if (idx >= end || idx < 0) {
                return '';
            }

            ret += str.charAt(idx);

            if (/[\uD800-\uDBFF]/.test(ret) && /[\uDC00-\uDFFF]/.test(str.charAt(idx + 1))) {
                ret += str.charAt(idx + 1);
            }

            return ret;
        }

        function printLog(msg) {
            if (verbose) {
                console.info(msg);
            }
        }

        function executeTransparently(command, args, callback, nostdout, nostderr) {
            try {
                var proc = spawn(command, args).on('error', function (error) {
                    console.error('Error in executeTransparently(), ' + error);
                    process.exit(1);
                });

                if (!nostdout) {
                    proc.stdout
                        .on('data', function (data) {
                            printLog(data.toString().replace(/[\n\r]/g, ''));
                        })
                        .on('error', function (error) {
                            console.error('STDOUT output error: ' + error);
                        });
                }

                if (!nostderr) {
                    proc.stderr
                        .on('data', function (data) {
                            console.error(data.toString().replace(/[\n\r]/g, ''));
                        })
                        .on('error', function (error) {
                            console.error('STDERR output error: ' + error);
                        });
                }

                proc.on('close', function (code) {
                    callback(code !== 0 ? 'Error when executing ' + command : undefined);
                });
            } catch (error) {
                callback('Error when executing ' + command);
            }
        }

        function validateEmail(email) {
            var emailRegex = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
            return emailRegex.test(email);
        }

        function touch(paths) {
            var currentDate = Date.now();
            paths = paths instanceof Array ? paths : [paths]
            paths.map(function (path) {
                fs.utimes(path, currentDate, currentDate, () => {});
            });
        }

        function getNextSiblingElement(node) {
            var sibling = node.nextSibling;
            while (sibling && sibling.nodeType != 1 /* ELEMENT_NODE */) {
                sibling = sibling.nextSibling;
            }
            return sibling;
        }

        process.on('uncaughtException', function (error) {
            console.error(error.stack);
            process.exit(42);
        });
    }
}
