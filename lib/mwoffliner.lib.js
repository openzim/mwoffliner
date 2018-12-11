"use strict";
/* ********************************** */
/* MODULE VARIABLE SECTION ********** */
/* ********************************** */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var async_1 = __importDefault(require("async"));
var child_process_1 = require("child_process");
var crypto_1 = __importDefault(require("crypto"));
var domino_1 = __importDefault(require("domino"));
var follow_redirects_1 = require("follow-redirects");
var fs_1 = __importDefault(require("fs"));
var html_minifier_1 = __importDefault(require("html-minifier"));
var node_fetch_1 = __importDefault(require("node-fetch"));
var os_1 = __importDefault(require("os"));
var parsoid_1 = __importDefault(require("parsoid"));
var path_1 = __importDefault(require("path"));
var swig_templates_1 = __importDefault(require("swig-templates"));
var url_1 = __importDefault(require("url"));
var utf8_binary_cutter_1 = __importDefault(require("utf8-binary-cutter"));
var zlib_1 = __importDefault(require("zlib"));
var semver_1 = __importDefault(require("semver"));
var config_1 = __importDefault(require("./config"));
var DOMUtils_1 = __importDefault(require("./DOMUtils"));
var Downloader_1 = __importDefault(require("./Downloader"));
var Logger_1 = __importDefault(require("./Logger"));
var MediaWiki_1 = __importDefault(require("./MediaWiki"));
var OfflinerEnv_1 = __importDefault(require("./OfflinerEnv"));
var parameterList_1 = __importDefault(require("./parameterList"));
var redis_1 = __importDefault(require("./redis"));
var U = __importStar(require("./Utils"));
var Utils_1 = require("./Utils");
var Zim_1 = __importDefault(require("./Zim"));
var package_json_1 = __importDefault(require("../package.json"));
function getParametersList() {
    // Want to remove this anonymous function. Need to investigate to see if it's needed
    return parameterList_1.default;
}
exports.getParametersList = getParametersList;
function execute(argv) {
    return __awaiter(this, void 0, void 0, function () {
        /* Some helpers */
        function readTemplate(t) {
            return fs_1.default.readFileSync(path_1.default.resolve(__dirname, '../res', t), 'utf-8');
        }
        function cssPath(css) {
            return [dirs.style, dirs.styleModules, css.replace(/(\.css)?$/, '') + ".css"].join('/');
        }
        function jsPath(js) {
            return [dirs.javascript, dirs.jsModules, js.replace(/(\.js)?$/, '') + ".js"].join('/');
        }
        function genHeaderCSSLink(css, classList) {
            if (classList === void 0) { classList = ''; }
            return "<link href=\"" + cssPath(css) + "\" rel=\"stylesheet\" type=\"text/css\" class=\"" + classList + "\" />";
        }
        function genHeaderScript(js, classList) {
            if (classList === void 0) { classList = ''; }
            return "<script src=\"" + jsPath(js) + "\" class=\"" + classList + "\"></script>";
        }
        function doDump(env, dump) {
            logger.log('Starting a new dump...');
            env.nopic = dump.toString().search('nopic') >= 0;
            env.novid = dump.toString().search('novid') >= 0;
            env.nopdf = dump.toString().search('nopdf') >= 0;
            env.nozim = dump.toString().search('nozim') >= 0;
            env.nodet = dump.toString().search('nodet') >= 0;
            env.keepHtml = env.nozim || env.keepHtml;
            env.htmlRootPath = env.computeHtmlRootPath();
            return Utils_1.doSeries([
                function () { return zim.createSubDirectories(); },
                function () { return saveStaticFiles(); },
                function () { return saveStylesheet(); },
                function () { return saveFavicon(); },
                articleList ? function () { return getArticleThumbnails(); } : null,
                function () { return getMainPage(); },
                env.writeHtmlRedirects ? function () { return saveHtmlRedirects(); } : null,
                function () { return saveArticles(dump); },
                function () { return drainDownloadFileQueue(); },
                function () { return drainOptimizationQueue(optimizationQueue); },
                function () { return zim.buildZIM(); },
                function () { return redis.delMediaDB(); },
            ]);
        }
        /* ********************************* */
        /* FUNCTIONS *********************** */
        /* ********************************* */
        function closeAgents() {
            follow_redirects_1.http.globalAgent.destroy();
            follow_redirects_1.https.globalAgent.destroy();
            return Promise.resolve();
        }
        function getArticleThumbnails() {
            var _this = this;
            logger.info("Getting article thumbnails");
            return new Promise(function (resolve, reject) {
                var articleIndex = 0;
                var fetchedThumbnails = 0;
                async_1.default.whilst(function () { return articleIndex < articleListLines.length - 1 && fetchedThumbnails < 100; }, function (callback) { return __awaiter(_this, void 0, void 0, function () {
                    var articleTitle, articleId, url, imageUrl, resp, err_1, internalSrc;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                articleTitle = articleListLines[articleIndex];
                                articleIndex++;
                                articleId = articleTitle.replace(/ /g, '_');
                                url = mw.imageQueryUrl(articleId);
                                imageUrl = null;
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, U.getJSON(url)];
                            case 2:
                                resp = _a.sent();
                                imageUrl = U.getFullUrl(webUrlHost, resp.query.pages[Object.keys(resp.query.pages)[0]].thumbnail.source);
                                return [3 /*break*/, 4];
                            case 3:
                                err_1 = _a.sent();
                                logger.warn("Failed to get thumbnail url for article [" + articleId + "]: " + err_1.message);
                                return [2 /*return*/, callback()];
                            case 4:
                                downloadFileQueue.push(imageUrl);
                                internalSrc = getMediaUrl(imageUrl);
                                articleDetailXId[articleId] = Object.assign(articleDetailXId[articleId] || {}, { thumbnail: internalSrc });
                                fetchedThumbnails++;
                                callback();
                                return [2 /*return*/];
                        }
                    });
                }); }, function (error) {
                    if (error) {
                        logger.error('Failed to get all article thumbnails', error);
                        reject({ message: "Failed to get all article thumbnails", error: error });
                    }
                    else {
                        resolve();
                    }
                });
            });
        }
        function saveStaticFiles() {
            return new Promise(function (resolve, reject) {
                config_1.default.output.cssResources
                    .concat(config_1.default.output.mainPageCssResources)
                    .forEach(function (css) {
                    try {
                        fs_1.default.readFile(path_1.default.resolve(__dirname, "../res/" + css + ".css"), function (err, data) { return fs_1.default.writeFile(path_1.default.resolve(env.htmlRootPath, cssPath(css)), data, function () { return null; }); });
                    }
                    catch (error) {
                        logger.warn("Could not create " + css + " file : " + error);
                    }
                });
                config_1.default.output.jsResources.forEach(function (js) {
                    try {
                        fs_1.default.readFile(path_1.default.resolve(__dirname, "../res/" + js + ".js"), function (err, data) {
                            return fs_1.default.writeFile(path_1.default.resolve(env.htmlRootPath, jsPath(js)), data, function () {
                                var noop = 1;
                            });
                        });
                    }
                    catch (error) {
                        logger.warn("Could not create " + js + " file : " + error);
                    }
                });
                resolve();
            });
        }
        function drainDownloadFileQueue() {
            return new Promise(function (resolve, reject) {
                logger.log(downloadFileQueue.length() + " files still to be downloaded.");
                async_1.default.doWhilst(function (doneWait) {
                    if (downloadFileQueue.idle()) {
                        logger.log('Process still downloading images...');
                    }
                    setTimeout(doneWait, 1000);
                }, function () { return !downloadFileQueue.idle(); }, function () {
                    var drainBackup = downloadFileQueue.drain;
                    downloadFileQueue.drain = function (error) {
                        if (error) {
                            reject("Error by downloading images " + error);
                        }
                        else {
                            if (downloadFileQueue.length() === 0) {
                                logger.log('All images successfuly downloaded');
                                downloadFileQueue.drain = drainBackup;
                                resolve();
                            }
                        }
                    };
                    downloadFileQueue.push('');
                });
            });
        }
        function drainOptimizationQueue(optimizationQueue) {
            return new Promise(function (resolve, reject) {
                logger.log(optimizationQueue.length() + " images still to be optimized.");
                async_1.default.doWhilst(function (doneWait) {
                    if (optimizationQueue.idle()) {
                        logger.log('Process still optimizing images...');
                    }
                    setTimeout(doneWait, 1000);
                }, function () { return !optimizationQueue.idle(); }, function () {
                    var drainBackup = optimizationQueue.drain;
                    optimizationQueue.drain = function (error) {
                        if (error) {
                            reject("Error by optimizing images " + error);
                        }
                        else {
                            if (optimizationQueue.length() === 0) {
                                logger.log('All images successfuly optimized');
                                optimizationQueue.drain = drainBackup;
                                resolve();
                            }
                        }
                    };
                    optimizationQueue.push({ path: '', size: 0 });
                });
            });
        }
        function cacheRedirects() {
            logger.log('Reset redirects cache file (or create it)');
            fs_1.default.openSync(zim.redirectsCacheFile, 'w');
            logger.log('Caching redirects...');
            function cacheRedirect(redirectId, finished) {
                redis.getRedirect(redirectId, finished, function (target) {
                    logger.info("Caching redirect " + redirectId + " (to " + target + ")...");
                    var line = 'A\t'
                        + (env.getArticleBase(redirectId) + "\t")
                        + (redirectId.replace(/_/g, ' ') + "\t")
                        + (env.getArticleBase(target, false) + "\n");
                    fs_1.default.appendFile(zim.redirectsCacheFile, line, finished);
                });
            }
            return redis.processAllRedirects(speed, cacheRedirect, 'Unable to cache a redirect', 'All redirects were cached successfuly.');
        }
        function saveHtmlRedirects() {
            logger.log('Saving HTML redirects...');
            function saveHtmlRedirect(redirectId, finished) {
                redis.getRedirect(redirectId, finished, function (target) {
                    logger.info("Writing HTML redirect " + redirectId + " (to " + target + ")...");
                    var data = redirectTemplate({
                        target: env.getArticleUrl(target),
                        title: redirectId.replace(/_/g, ' '),
                    });
                    if (env.deflateTmpHtml) {
                        zlib_1.default.deflate(data, function (error, deflatedHtml) {
                            fs_1.default.writeFile(env.getArticlePath(redirectId), deflatedHtml, finished);
                        });
                    }
                    else {
                        fs_1.default.writeFile(env.getArticlePath(redirectId), data, finished);
                    }
                });
            }
            return redis.processAllRedirects(speed, saveHtmlRedirect, 'Unable to save a HTML redirect', 'All redirects were saved successfuly as HTML files.');
        }
        function saveArticles(dump) {
            return new Promise(function (resolve, reject) {
                // these vars will store the list of js and css dependencies for the article we are downloading. they are populated in storeDependencies and used in setFooter
                var jsConfigVars = '';
                var jsDependenciesList = [];
                var styleDependenciesList = [];
                function parseHtml(html, articleId, finished) {
                    try {
                        finished(null, domino_1.default.createDocument(html), articleId);
                    }
                    catch (error) {
                        finished({ message: "Crash while parsing " + articleId, error: error });
                    }
                }
                function storeDependencies(parsoidDoc, articleId, finished) {
                    var articleApiUrl = mw.articleApiUrl(articleId);
                    node_fetch_1.default(articleApiUrl, {
                        headers: { Accept: 'application/json' },
                        method: 'GET',
                    })
                        .then(function (response) { return response.json(); })
                        .then(function (_a) {
                        var _b = _a.parse, modules = _b.modules, modulescripts = _b.modulescripts, modulestyles = _b.modulestyles, headhtml = _b.headhtml;
                        jsDependenciesList = genericJsModules.concat(modules, modulescripts).filter(function (a) { return a; });
                        styleDependenciesList = [].concat(modules, modulestyles, genericCssModules).filter(function (a) { return a; });
                        styleDependenciesList = styleDependenciesList.filter(function (oneStyleDep) { return !Utils_1.contains(config_1.default.filters.blackListCssModules, oneStyleDep); });
                        logger.info("Js dependencies of " + articleId + " : " + jsDependenciesList);
                        logger.info("Css dependencies of " + articleId + " : " + styleDependenciesList);
                        var allDependenciesWithType = [
                            { type: 'js', moduleList: jsDependenciesList },
                            { type: 'css', moduleList: styleDependenciesList },
                        ];
                        allDependenciesWithType.forEach(function (_a) {
                            var type = _a.type, moduleList = _a.moduleList;
                            return moduleList.forEach(function (oneModule) { return downloadAndSaveModule(oneModule, type); });
                        });
                        // Saving, as a js module, the jsconfigvars that are set in the header of a wikipedia page
                        // the script below extracts the config with a regex executed on the page header returned from the api
                        var scriptTags = domino_1.default.createDocument(headhtml['*'] + "</body></html>").getElementsByTagName('script');
                        var regex = /mw\.config\.set\(\{.*?\}\);/mg;
                        // tslint:disable-next-line:prefer-for-of
                        for (var i = 0; i < scriptTags.length; i += 1) {
                            if (scriptTags[i].text.includes('mw.config.set')) {
                                jsConfigVars = regex.exec(scriptTags[i].text);
                            }
                        }
                        jsConfigVars = "(window.RLQ=window.RLQ||[]).push(function() {" + jsConfigVars + "});";
                        jsConfigVars = jsConfigVars.replace('nosuchaction', 'view'); // to replace the wgAction config that is set to 'nosuchaction' from api but should be 'view'
                        try {
                            fs_1.default.writeFileSync(path_1.default.resolve(env.htmlRootPath, jsPath('jsConfigVars')), jsConfigVars);
                            logger.log("created dep jsConfigVars.js for article " + articleId);
                        }
                        catch (e) {
                            logger.warn('Error writing file', e);
                        }
                        finished(null, parsoidDoc, articleId);
                    })
                        .catch(function (e) {
                        logger.warn("Error fetching api.php for " + articleApiUrl + " " + e);
                        finished(null, parsoidDoc, articleId); // calling finished here will allow zim generation to continue event if an article doesn't properly get its modules
                    });
                    function downloadAndSaveModule(module, type) {
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
                            return jsCode.replace('script=document.createElement(\'script\');', "\n                        document.body.addEventListener('fireStartUp', function () { startUp() }, false);\n                        return;\n                        script=document.createElement('script');");
                        }
                        function hackMediaWikiModule(jsCode) {
                            jsCode += "(function () {\n                const startUpEvent = new CustomEvent('fireStartUp');\n                document.body.dispatchEvent(startUpEvent);\n            })()";
                            return jsCode;
                        }
                        var moduleUri;
                        var apiParameterOnly;
                        if (type === 'js') {
                            moduleUri = path_1.default.resolve(env.htmlRootPath, jsPath(module));
                            apiParameterOnly = 'scripts';
                        }
                        else if (type === 'css') {
                            moduleUri = path_1.default.resolve(env.htmlRootPath, cssPath(module));
                            apiParameterOnly = 'styles';
                        }
                        logger.info("Getting [" + type + "] module [" + module + "]");
                        var moduleApiUrl = encodeURI(mw.base + "w/load.php?debug=false&lang=en&modules=" + module + "&only=" + apiParameterOnly + "&skin=vector&version=&*");
                        return redis.saveModuleIfNotExists(dump, module, moduleUri, type)
                            .then(function (redisResult) {
                            if (redisResult === 1) {
                                return node_fetch_1.default(moduleApiUrl, {
                                    method: 'GET',
                                    headers: { Accept: 'text/plain' },
                                })
                                    .then(function (response) { return response.text(); })
                                    .then(function (text) {
                                    if (module === 'startup' && type === 'js') {
                                        text = hackStartUpModule(text);
                                    }
                                    else if (module === 'mediawiki' && type === 'js') {
                                        text = hackMediaWikiModule(text);
                                    }
                                    try {
                                        fs_1.default.writeFileSync(moduleUri, text);
                                        logger.info("created dep " + module + " for article " + articleId);
                                    }
                                    catch (e) {
                                        logger.warn("Error writing file " + moduleUri + " " + e);
                                    }
                                })
                                    .catch(function (e) { return logger.warn("Error fetching load.php for " + articleId + " " + e); });
                            }
                            else {
                                return Promise.resolve();
                            }
                        })
                            .catch(function (e) { return logger.error(e); });
                    }
                }
                function treatMedias(parsoidDoc, articleId, finished) {
                    /* Clean/rewrite image tags */
                    var imgs = parsoidDoc.getElementsByTagName('img');
                    var videos = Array.from(parsoidDoc.getElementsByTagName('video'));
                    var srcCache = {};
                    videos.forEach(function (videoEl) {
                        // Worth noting:
                        // Video tags are used for audio files too (as opposed to the audio tag)
                        // When it's only audio, there will be a single OGG file
                        // For video, we get multiple SOURCE tages with different resolutions
                        var posterUrl = videoEl.getAttribute('poster');
                        var videoPosterUrl = U.getFullUrl(webUrlHost, posterUrl);
                        var newVideoPosterUrl = getMediaUrl(videoPosterUrl);
                        var videoSources = Array.from(videoEl.children).filter(function (child) { return child.tagName === 'SOURCE'; });
                        // Firefox is not able to display correctly <video> nodes with a height < 40.
                        // In that case the controls are not displayed.
                        if (videoEl.getAttribute('height') && videoEl.getAttribute('height') < 40) {
                            videoEl.setAttribute('height', '40');
                        }
                        // Always show controls
                        videoEl.setAttribute('controls', '40');
                        if (env.nopic || env.novid || env.nodet) {
                            DOMUtils_1.default.deleteNode(videoEl);
                            return;
                        }
                        if (posterUrl) {
                            videoEl.setAttribute('poster', newVideoPosterUrl);
                        }
                        videoEl.removeAttribute('resource');
                        if (!srcCache.hasOwnProperty(videoPosterUrl)) {
                            srcCache[videoPosterUrl] = true;
                            downloadFileQueue.push(videoPosterUrl);
                        }
                        function byWidthXHeight(a, b) {
                            // If there is no width/height, it counts as zero, probably best?
                            // Sometimes (pure audio) there will only be one item
                            // Sometimes (pure audio) there won't be width/height
                            var aWidth = Number(a.getAttribute('data-file-width') || a.getAttribute('data-width') || 0);
                            var aHeight = Number(a.getAttribute('data-file-height') || a.getAttribute('data-height') || 0);
                            var bWidth = Number(b.getAttribute('data-file-width') || b.getAttribute('data-width') || 0);
                            var bHeight = Number(b.getAttribute('data-file-height') || b.getAttribute('data-height') || 0);
                            var aVal = aWidth * aHeight;
                            var bVal = bWidth * bHeight;
                            return aVal > bVal ? 1 : -1;
                        }
                        videoSources = videoSources.sort(byWidthXHeight);
                        var sourcesToRemove = videoSources.slice(1); // All but first
                        sourcesToRemove.forEach(DOMUtils_1.default.deleteNode);
                        var sourceEl = videoSources[0]; // Use first source (smallest resolution)
                        var sourceUrl = U.getFullUrl(webUrlHost, sourceEl.getAttribute('src'));
                        var newUrl = getMediaUrl(sourceUrl);
                        if (!newUrl) {
                            DOMUtils_1.default.deleteNode(sourceEl);
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
                    for (var i = 0; i < imgs.length; i += 1) {
                        var img = imgs[i];
                        var imageNodeClass = img.getAttribute('class') || '';
                        if ((!env.nopic
                            || imageNodeClass.search('mwe-math-fallback-image-inline') >= 0
                            || img.getAttribute('typeof') === 'mw:Extension/math')
                            && img.getAttribute('src')
                            && img.getAttribute('src').indexOf('./Special:FilePath/') !== 0) {
                            /* Remove image link */
                            var linkNode = img.parentNode;
                            if (linkNode.tagName === 'A') {
                                /* Check if the target is mirrored */
                                var href = linkNode.getAttribute('href') || '';
                                var title = mw.extractPageTitleFromHref(href);
                                var keepLink = title && isMirrored(title);
                                /* Under certain condition it seems that this is possible
                                                 * to have parentNode == undefined, in this case this
                                                 * seems preferable to remove the whole link+content than
                                                 * keeping a wrong link. See for example this url
                                                 * http://parsoid.wmflabs.org/ko/%EC%9D%B4%ED%9C%98%EC%86%8C */
                                if (!keepLink) {
                                    if (linkNode.parentNode) {
                                        linkNode.parentNode.replaceChild(img, linkNode);
                                    }
                                    else {
                                        DOMUtils_1.default.deleteNode(img);
                                    }
                                }
                            }
                            /* Rewrite image src attribute */
                            if (img) {
                                var src = U.getFullUrl(webUrlHost, img.getAttribute('src'));
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
                                }
                                else {
                                    DOMUtils_1.default.deleteNode(img);
                                }
                            }
                        }
                        else {
                            DOMUtils_1.default.deleteNode(img);
                        }
                    }
                    /* Improve image frames */
                    var figures = parsoidDoc.getElementsByTagName('figure');
                    var spans = parsoidDoc.querySelectorAll('span[typeof=mw:Image/Frameless]');
                    var imageNodes = Array.prototype.slice.call(figures).concat(Array.prototype.slice.call(spans));
                    // tslint:disable-next-line:prefer-for-of
                    for (var i = 0; i < imageNodes.length; i += 1) {
                        var imageNode = imageNodes[i];
                        var image = void 0;
                        var numImages = imageNode.getElementsByTagName('img').length;
                        var numVideos = imageNode.getElementsByTagName('video').length;
                        if (numImages) {
                            image = imageNode.getElementsByTagName('img')[0];
                        }
                        else if (numVideos) {
                            image = imageNode.getElementsByTagName('video')[0];
                        }
                        var isStillLinked = image && image.parentNode && image.parentNode.tagName === 'A';
                        if (!env.nopic && imageNode && image) {
                            var imageNodeClass = imageNode.getAttribute('class') || ''; // imageNodeClass already defined
                            var imageNodeTypeof = imageNode.getAttribute('typeof') || '';
                            var descriptions = imageNode.getElementsByTagName('figcaption');
                            var description = descriptions.length > 0 ? descriptions[0] : undefined;
                            var imageWidth = parseInt(image.getAttribute('width'), 10);
                            var thumbDiv = parsoidDoc.createElement('div');
                            thumbDiv.setAttribute('class', 'thumb');
                            if (imageNodeClass.search('mw-halign-right') >= 0) {
                                DOMUtils_1.default.appendToAttr(thumbDiv, 'class', 'tright');
                            }
                            else if (imageNodeClass.search('mw-halign-left') >= 0) {
                                DOMUtils_1.default.appendToAttr(thumbDiv, 'class', 'tleft');
                            }
                            else if (imageNodeClass.search('mw-halign-center') >= 0) {
                                DOMUtils_1.default.appendToAttr(thumbDiv, 'class', 'tnone');
                                var centerDiv = parsoidDoc.createElement('center');
                                centerDiv.appendChild(thumbDiv);
                                thumbDiv = centerDiv;
                            }
                            else {
                                var revAutoAlign = env.ltr ? 'right' : 'left';
                                DOMUtils_1.default.appendToAttr(thumbDiv, 'class', "t" + revAutoAlign);
                            }
                            var thumbinnerDiv = parsoidDoc.createElement('div');
                            thumbinnerDiv.setAttribute('class', 'thumbinner');
                            thumbinnerDiv.setAttribute('style', "width:" + (imageWidth + 2) + "px");
                            var thumbcaptionDiv = parsoidDoc.createElement('div');
                            thumbcaptionDiv.setAttribute('class', 'thumbcaption');
                            var autoAlign = env.ltr ? 'left' : 'right';
                            thumbcaptionDiv.setAttribute('style', "text-align: " + autoAlign);
                            if (description) {
                                thumbcaptionDiv.innerHTML = description.innerHTML;
                            }
                            thumbinnerDiv.appendChild(isStillLinked ? image.parentNode : image);
                            thumbinnerDiv.appendChild(thumbcaptionDiv);
                            thumbDiv.appendChild(thumbinnerDiv);
                            imageNode.parentNode.replaceChild(thumbDiv, imageNode);
                        }
                        else {
                            DOMUtils_1.default.deleteNode(imageNode);
                        }
                    }
                    finished(null, parsoidDoc, articleId);
                }
                function rewriteUrls(parsoidDoc, articleId, finished) {
                    /* Go through all links */
                    var as = parsoidDoc.getElementsByTagName('a');
                    var areas = parsoidDoc.getElementsByTagName('area');
                    var linkNodes = Array.prototype.slice.call(as).concat(Array.prototype.slice.call(areas));
                    function removeLinksToUnmirroredArticles(linkNode, href, cb) {
                        var title = mw.extractPageTitleFromHref(href);
                        if (!title) {
                            setImmediate(function () { return cb(); });
                            return;
                        }
                        if (isMirrored(title)) {
                            /* Deal with local anchor */
                            var localAnchor = href.lastIndexOf('#') === -1 ? '' : href.substr(href.lastIndexOf('#'));
                            linkNode.setAttribute('href', env.getArticleUrl(title) + localAnchor);
                            setImmediate(function () { return cb(); });
                        }
                        else {
                            redis.processRedirectIfExists(title, function (res) {
                                if (res) {
                                    linkNode.setAttribute('href', env.getArticleUrl(title));
                                }
                                else {
                                    U.migrateChildren(linkNode, linkNode.parentNode, linkNode);
                                    linkNode.parentNode.removeChild(linkNode);
                                }
                                setImmediate(function () { return cb(); });
                            });
                        }
                    }
                    function rewriteUrl(linkNode, finished) {
                        var rel = linkNode.getAttribute('rel');
                        var href = linkNode.getAttribute('href') || '';
                        if (!href) {
                            DOMUtils_1.default.deleteNode(linkNode);
                            setImmediate(function () { return finished(); });
                        }
                        else if (href.substring(0, 1) === '#') {
                            setImmediate(function () { return finished(); });
                        }
                        else {
                            /* Deal with custom geo. URL replacement, for example:
                             * http://maps.wikivoyage-ev.org/w/poimap2.php?lat=44.5044943&lon=34.1969633&zoom=15&layer=M&lang=ru&name=%D0%9C%D0%B0%D1%81%D1%81%D0%B0%D0%BD%D0%B4%D1%80%D0%B0
                             * http://tools.wmflabs.org/geohack/geohack.php?language=fr&pagename=Tour_Eiffel&params=48.85825_N_2.2945_E_type:landmark_region:fr
                             */
                            if (rel !== 'mw:WikiLink') {
                                var lat = void 0;
                                var lon = void 0;
                                if (/poimap2\.php/i.test(href)) {
                                    var hrefQuery = url_1.default.parse(href, true).query;
                                    lat = parseFloat(hrefQuery.lat);
                                    lon = parseFloat(hrefQuery.lon);
                                }
                                else if (/geohack\.php/i.test(href)) {
                                    var params = url_1.default.parse(href, true).query.params;
                                    /* "params" might be an array, try to detect the geo localization one */
                                    if (params instanceof Array) {
                                        var i = 0;
                                        while (params[i] && isNaN(+params[i][0])) {
                                            i += 1;
                                        }
                                        params = params[i];
                                    }
                                    if (params) {
                                        // see https://bitbucket.org/magnusmanske/geohack/src public_html geo_param.php
                                        var pieces_1 = params.toUpperCase().split('_');
                                        var semiPieces = pieces_1.length > 0 ? pieces_1[0].split(';') : undefined;
                                        if (semiPieces && semiPieces.length === 2) {
                                            lat = semiPieces[0], lon = semiPieces[1];
                                        }
                                        else {
                                            var factors_1 = [1, 60, 3600];
                                            var offs_1 = 0;
                                            var deg = function (hemiHash) {
                                                var out = 0;
                                                var hemiSign = 0;
                                                for (var i = 0; i < 4 && i + offs_1 < pieces_1.length; i += 1) {
                                                    var v = pieces_1[i + offs_1];
                                                    hemiSign = hemiHash[v];
                                                    if (hemiSign) {
                                                        offs_1 = i + 1;
                                                        break;
                                                    }
                                                    out += +v / factors_1[i];
                                                }
                                                return out * hemiSign;
                                            };
                                            lat = deg({ N: 1, S: -1 });
                                            lon = deg({ E: 1, W: -1, O: 1 });
                                        }
                                    }
                                }
                                else if (/Special:Map/i.test(href)) {
                                    var parts = href.split('/');
                                    lat = parts[4];
                                    lon = parts[5];
                                }
                                else if (rel === 'mw:MediaLink') {
                                    if (!env.nopdf && /\.pdf/i.test(href)) {
                                        try {
                                            linkNode.setAttribute('href', getMediaUrl(href));
                                            downloadFileQueue.push(href);
                                        }
                                        catch (err) {
                                            logger.warn('Error parsing url:', err);
                                            DOMUtils_1.default.deleteNode(linkNode);
                                        }
                                    }
                                }
                                if (!isNaN(lat) && !isNaN(lon)) {
                                    href = "geo:" + lat + "," + lon;
                                    linkNode.setAttribute('href', href);
                                }
                            }
                            if (rel) { // This is Parsoid HTML
                                /* Add 'external' class to interwiki links */
                                if (rel === 'mw:WikiLink/Interwiki') {
                                    DOMUtils_1.default.appendToAttr(linkNode, 'class', 'external');
                                }
                                /* Check if the link is "valid" */
                                if (!href) {
                                    return finished({ message: "No href attribute in the following code, in article " + articleId + "\n" + linkNode.outerHTML });
                                }
                                /* Rewrite external links starting with // */
                                if (rel.substring(0, 10) === 'mw:ExtLink' || rel === 'nofollow') {
                                    if (href.substring(0, 1) === '/') {
                                        linkNode.setAttribute('href', U.getFullUrl(webUrlHost, href));
                                    }
                                    else if (href.substring(0, 2) === './') {
                                        U.migrateChildren(linkNode, linkNode.parentNode, linkNode);
                                        linkNode.parentNode.removeChild(linkNode);
                                    }
                                    setImmediate(function () { return finished(); });
                                }
                                else if (rel === 'mw:WikiLink' || rel === 'mw:referencedBy') {
                                    removeLinksToUnmirroredArticles(linkNode, href, finished);
                                }
                                else {
                                    setImmediate(function () { return finished(); });
                                }
                            }
                            else { // This is MediaWiki HTML
                                removeLinksToUnmirroredArticles(linkNode, href, finished);
                            }
                        }
                    }
                    async_1.default.eachLimit(linkNodes, speed, rewriteUrl, function (error) {
                        finished(error && { message: "Problem rewriting urls", error: error }, parsoidDoc, articleId);
                    });
                }
                function applyOtherTreatments(parsoidDoc, articleId, finished) {
                    var filtersConfig = config_1.default.filters;
                    /* Don't need <link> and <input> tags */
                    var nodesToDelete = [{ tag: 'link' }, { tag: 'input' }];
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
                        filter: function (n) {
                            return !n.getElementsByTagName('img').length
                                && !n.getElementsByTagName('audio').length
                                && !n.getElementsByTagName('video').length;
                        },
                    });
                    nodesToDelete.push({
                        class: 'gallery',
                        filter: function (n) {
                            return !n.getElementsByClassName('gallerybox').length;
                        },
                    });
                    /* Remove element with black listed CSS classes */
                    filtersConfig.cssClassBlackList.forEach(function (classname) {
                        nodesToDelete.push({ class: classname });
                    });
                    if (env.nodet) {
                        filtersConfig.nodetCssClassBlackList.forEach(function (classname) {
                            nodesToDelete.push({ class: classname });
                        });
                    }
                    /* Remove element with black listed CSS classes and no link */
                    filtersConfig.cssClassBlackListIfNoLink.forEach(function (classname) {
                        nodesToDelete.push({
                            class: classname,
                            filter: function (n) {
                                return n.getElementsByTagName('a').length === 0;
                            },
                        });
                    });
                    /* Delete them all */
                    nodesToDelete.forEach(function (t) {
                        var nodes;
                        if (t.tag) {
                            nodes = parsoidDoc.getElementsByTagName(t.tag);
                        }
                        else if (t.class) {
                            nodes = parsoidDoc.getElementsByClassName(t.class);
                        }
                        else {
                            return; /* throw error? */
                        }
                        var f = t.filter;
                        // tslint:disable-next-line:prefer-for-of
                        for (var i = 0; i < nodes.length; i += 1) {
                            if (!f || f(nodes[i])) {
                                DOMUtils_1.default.deleteNode(nodes[i]);
                            }
                        }
                    });
                    /* Go through all reference calls */
                    var spans = parsoidDoc.getElementsByTagName('span');
                    // tslint:disable-next-line:prefer-for-of
                    for (var i = 0; i < spans.length; i += 1) {
                        var span = spans[i];
                        var rel = span.getAttribute('rel');
                        if (rel === 'dc:references') {
                            var sup = parsoidDoc.createElement('sup');
                            if (span.innerHTML) {
                                sup.id = span.id;
                                sup.innerHTML = span.innerHTML;
                                span.parentNode.replaceChild(sup, span);
                            }
                            else {
                                DOMUtils_1.default.deleteNode(span);
                            }
                        }
                    }
                    /* Remove element with id in the blacklist */
                    filtersConfig.idBlackList.forEach(function (id) {
                        var node = parsoidDoc.getElementById(id);
                        if (node) {
                            DOMUtils_1.default.deleteNode(node);
                        }
                    });
                    /* Force display of element with that CSS class */
                    filtersConfig.cssClassDisplayList.map(function (classname) {
                        var nodes = parsoidDoc.getElementsByClassName(classname);
                        // tslint:disable-next-line:prefer-for-of
                        for (var i = 0; i < nodes.length; i += 1) {
                            nodes[i].style.removeProperty('display');
                        }
                    });
                    /* Remove empty paragraphs */
                    if (!keepEmptyParagraphs) {
                        for (var level = 5; level > 0; level--) {
                            var paragraphNodes = parsoidDoc.getElementsByTagName("h" + level);
                            // tslint:disable-next-line:prefer-for-of
                            for (var i = 0; i < paragraphNodes.length; i += 1) {
                                var paragraphNode = paragraphNodes[i];
                                var nextElementNode = DOMUtils_1.default.nextElementSibling(paragraphNode);
                                /* No nodes */
                                if (!nextElementNode) {
                                    DOMUtils_1.default.deleteNode(paragraphNode);
                                }
                                else {
                                    /* Delete if nextElementNode is a paragraph with <= level */
                                    var nextElementNodeTag = nextElementNode.tagName.toLowerCase();
                                    if (nextElementNodeTag.length > 1
                                        && nextElementNodeTag[0] === 'h'
                                        && !isNaN(nextElementNodeTag[1])
                                        && nextElementNodeTag[1] <= level) {
                                        DOMUtils_1.default.deleteNode(paragraphNode);
                                    }
                                }
                            }
                        }
                    }
                    /* Clean the DOM of all uncessary code */
                    var allNodes = parsoidDoc.getElementsByTagName('*');
                    var _loop_1 = function (i) {
                        var node = allNodes[i];
                        node.removeAttribute('data-parsoid');
                        node.removeAttribute('typeof');
                        node.removeAttribute('about');
                        node.removeAttribute('data-mw');
                        if (node.getAttribute('rel') && node.getAttribute('rel').substr(0, 3) === 'mw:') {
                            node.removeAttribute('rel');
                        }
                        /* Remove a few css calls */
                        filtersConfig.cssClassCallsBlackList.map(function (classname) {
                            if (node.getAttribute('class')) {
                                node.setAttribute('class', node.getAttribute('class').replace(classname, ''));
                            }
                        });
                    };
                    // tslint:disable-next-line:prefer-for-of
                    for (var i = 0; i < allNodes.length; i += 1) {
                        _loop_1(i);
                    }
                    finished(null, parsoidDoc, articleId);
                }
                function setFooter(parsoidDoc, articleId, finished) {
                    var htmlTemplateDoc = domino_1.default.createDocument(htmlTemplateCode
                        .replace('__ARTICLE_CONFIGVARS_LIST__', jsConfigVars !== '' ? genHeaderScript('jsConfigVars') : '')
                        .replace('__ARTICLE_JS_LIST__', jsDependenciesList.length !== 0
                        ? jsDependenciesList.map(function (oneJsDep) { return genHeaderScript(oneJsDep); }).join('\n')
                        : '')
                        .replace('__ARTICLE_CSS_LIST__', styleDependenciesList.length !== 0
                        ? styleDependenciesList.map(function (oneCssDep) { return genHeaderCSSLink(oneCssDep); }).join('\n')
                        : ''));
                    /* Create final document by merging template and parsoid documents */
                    htmlTemplateDoc.getElementById('mw-content-text').style.setProperty('direction', env.ltr ? 'ltr' : 'rtl');
                    htmlTemplateDoc.getElementById('mw-content-text').innerHTML = parsoidDoc.getElementsByTagName('body')[0].innerHTML;
                    /* Title */
                    htmlTemplateDoc.getElementsByTagName('title')[0].innerHTML = htmlTemplateDoc.getElementById('title_0')
                        ? htmlTemplateDoc.getElementById('title_0').textContent
                        : articleId.replace(/_/g, ' ');
                    DOMUtils_1.default.deleteNode(htmlTemplateDoc.getElementById('titleHeading'));
                    /* Subpage */
                    if (isSubpage(articleId) && zim.mainPageId !== articleId) {
                        var headingNode = htmlTemplateDoc.getElementById('mw-content-text');
                        var subpagesNode = htmlTemplateDoc.createElement('span');
                        var parents = articleId.split('/');
                        parents.pop();
                        var subpages_1 = '';
                        var parentPath_1 = '';
                        parents.map(function (parent) {
                            var label = parent.replace(/_/g, ' ');
                            var isParentMirrored = isMirrored(parentPath_1 + parent);
                            subpages_1
                                += "&lt; " + (isParentMirrored
                                    ? "<a href=\"" + env.getArticleUrl(parentPath_1 + parent) + "\" title=\"" + label + "\">"
                                    : '') + label + (isParentMirrored ? '</a> ' : ' ');
                            parentPath_1 += parent + "/";
                        });
                        subpagesNode.innerHTML = subpages_1;
                        subpagesNode.setAttribute('class', 'subpages');
                        headingNode.parentNode.insertBefore(subpagesNode, headingNode);
                    }
                    /* Set footer */
                    var div = htmlTemplateDoc.createElement('div');
                    var oldId = articleDetailXId[articleId].oldId;
                    redis.getArticle(articleId, function (error, detailsJson) {
                        if (error) {
                            finished({ message: "Unable to get the details from redis for article " + articleId, error: error });
                        }
                        else {
                            /* Is seems that sporadically this goes wrong */
                            var details = JSON.parse(detailsJson);
                            /* Revision date */
                            var timestamp = details.t;
                            var date = new Date(timestamp * 1000);
                            div.innerHTML = footerTemplate({
                                articleId: encodeURIComponent(articleId),
                                webUrl: mw.webUrl,
                                creator: zim.creator,
                                oldId: oldId,
                                date: date.toISOString().substring(0, 10),
                            });
                            htmlTemplateDoc.getElementById('mw-content-text').appendChild(div);
                            addNoIndexCommentToElement(div);
                            /* Geo-coordinates */
                            var geoCoordinates = details.g;
                            if (geoCoordinates) {
                                var metaNode = htmlTemplateDoc.createElement('meta');
                                metaNode.name = 'geo.position';
                                metaNode.content = geoCoordinates; // latitude + ';' + longitude;
                                htmlTemplateDoc.getElementsByTagName('head')[0].appendChild(metaNode);
                            }
                            finished(null, htmlTemplateDoc, articleId);
                        }
                    });
                }
                function writeArticle(doc, articleId, finished) {
                    logger.log("Saving article " + articleId + "...");
                    var html = doc.documentElement.outerHTML;
                    if (minifyHtml) {
                        html = html_minifier_1.default.minify(html, {
                            removeComments: true,
                            conservativeCollapse: true,
                            collapseBooleanAttributes: true,
                            removeRedundantAttributes: true,
                            removeEmptyAttributes: true,
                            minifyCSS: true,
                        });
                    }
                    if (env.deflateTmpHtml) {
                        zlib_1.default.deflate(html, function (error, deflatedHtml) {
                            fs_1.default.writeFile(env.getArticlePath(articleId), deflatedHtml, finished);
                        });
                    }
                    else {
                        fs_1.default.writeFile(env.getArticlePath(articleId), html, finished);
                    }
                }
                function saveArticle(articleId, finished) {
                    var html = '';
                    var articleApiUrl = mw.base + "api/rest_v1/page/mobile-sections/" + encodeURIComponent(articleId);
                    logger.log("Getting (mobile) article from " + articleApiUrl);
                    node_fetch_1.default(articleApiUrl, {
                        method: 'GET',
                        headers: { Accept: 'application/json' },
                    })
                        .then(function (response) { return response.json(); })
                        .then(function (json) {
                        // set the first section (open by default)
                        html += leadSectionTemplate({
                            lead_display_title: json.lead.displaytitle,
                            lead_section_text: json.lead.sections[0].text,
                        });
                        // set all other section (closed by default)
                        if (!env.nodet) {
                            json.remaining.sections.forEach(function (oneSection, i) {
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
                                    html = html.replace("__SUB_LEVEL_SECTION_" + (oneSection.id - 1) + "__", ''); // remove unused anchor for subsection
                                    html += sectionTemplate({
                                        section_index: i + 1,
                                        section_id: oneSection.id,
                                        section_anchor: oneSection.anchor,
                                        section_line: oneSection.line,
                                        section_text: oneSection.text,
                                    });
                                }
                                else {
                                    var replacement = subSectionTemplate({
                                        section_index: i + 1,
                                        section_toclevel: oneSection.toclevel + 1,
                                        section_id: oneSection.id,
                                        section_anchor: oneSection.anchor,
                                        section_line: oneSection.line,
                                        section_text: oneSection.text,
                                    });
                                    html = html.replace("__SUB_LEVEL_SECTION_" + (oneSection.id - 1) + "__", replacement);
                                }
                            });
                        }
                        html = html.replace("__SUB_LEVEL_SECTION_" + json.remaining.sections.length + "__", ''); // remove the last subcestion anchor (all other anchor are removed in the forEach)
                        buildArticleFromApiData();
                    })
                        .catch(function (e) {
                        logger.error("Error handling json response from api. " + e);
                        buildArticleFromApiData();
                    });
                    function buildArticleFromApiData() {
                        if (html) {
                            var articlePath = env.getArticlePath(articleId);
                            var prepareAndSaveArticle = async_1.default.compose(writeArticle, setFooter, applyOtherTreatments, rewriteUrls, treatMedias, storeDependencies, parseHtml);
                            logger.info("Treating and saving article " + articleId + " at " + articlePath + "...");
                            prepareAndSaveArticle(html, articleId, function (error) {
                                if (!error) {
                                    logger.info("Successfully dumped article " + articleId);
                                    finished();
                                }
                                else {
                                    logger.warn("Error preparing and saving file, skipping [" + articleId + "]", error);
                                    finished(error);
                                }
                            });
                        }
                        else {
                            delete articleDetailXId[articleId];
                            finished();
                        }
                    }
                }
                logger.log('Saving articles...');
                async_1.default.eachLimit(Object.keys(articleDetailXId), speed, saveArticle, function (error) {
                    if (error) {
                        reject({ message: "Fatal Error:", error: error });
                    }
                    else {
                        logger.log('All articles were retrieved and saved.');
                        resolve();
                    }
                });
            });
        }
        function addNoIndexCommentToElement(element) {
            var slices = element.parentElement.innerHTML.split(element.outerHTML);
            element.parentElement.innerHTML = slices[0] + "<!--htdig_noindex-->" + element.outerHTML + "<!--/htdig_noindex-->" + slices[1];
        }
        function isMirrored(id) {
            if (!zim.articleList && id && id.indexOf(':') >= 0) {
                var namespace = mw.namespaces[id.substring(0, id.indexOf(':')).replace(/ /g, mw.spaceDelimiter)];
                if (namespace !== undefined) {
                    return namespace.isContent;
                }
            }
            return id in articleDetailXId;
        }
        function isSubpage(id) {
            if (id && id.indexOf('/') >= 0) {
                var namespace = id.indexOf(':') >= 0 ? id.substring(0, id.indexOf(':')).replace(/ /g, mw.spaceDelimiter) : '';
                namespace = mw.namespaces[namespace]; // namespace already defined
                if (namespace !== undefined) {
                    return namespace.allowedSubpages;
                }
            }
            return false;
        }
        /* Grab and concatenate stylesheet files */
        function saveStylesheet() {
            var _this = this;
            return new Promise(function (resolve, reject) {
                logger.log('Dumping stylesheets...');
                var urlCache = {};
                var stylePath = "" + env.htmlRootPath + dirs.style + "/style.css";
                /* Remove if exists */
                fs_1.default.unlink(stylePath, function () { return null; });
                /* Take care to download medias */
                var downloadCSSFileQueue = async_1.default.queue(function (data, finished) {
                    downloader.downloadMediaFile(data.url, data.path, true, optimizationQueue, finished);
                }, speed);
                /* Take care to download CSS files */
                var downloadCSSQueue = async_1.default.queue(function (link, finished) { return __awaiter(_this, void 0, void 0, function () {
                    var cssUrl, linkMedia, cssUrlRegexp, content, body, rewrittenCss, match, url, filePathname, filename, err_2;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                _a.trys.push([0, 4, , 5]);
                                cssUrl = typeof link === 'object' ? U.getFullUrl(webUrlHost, link.getAttribute('href')) : link;
                                linkMedia = typeof link === 'object' ? link.getAttribute('media') : null;
                                if (!cssUrl) return [3 /*break*/, 2];
                                cssUrlRegexp = new RegExp('url\\([\'"]{0,1}(.+?)[\'"]{0,1}\\)', 'gi');
                                logger.info("Downloading CSS from " + decodeURI(cssUrl));
                                return [4 /*yield*/, downloader.downloadContent(cssUrl)];
                            case 1:
                                content = (_a.sent()).content;
                                body = content.toString();
                                rewrittenCss = "\n/* start " + cssUrl + " */\n\n";
                                rewrittenCss += linkMedia ? "@media " + linkMedia + "  {\n" : '\n';
                                rewrittenCss += body + "\n";
                                rewrittenCss += linkMedia ? "} /* @media " + linkMedia + " */\n" : '\n';
                                rewrittenCss += "\n/* end   " + cssUrl + " */\n";
                                match = void 0;
                                // tslint:disable-next-line:no-conditional-assignment
                                while ((match = cssUrlRegexp.exec(body))) {
                                    url = match[1];
                                    /* Avoid 'data', so no url dependency */
                                    if (!url.match('^data')) {
                                        filePathname = url_1.default.parse(url, false, true).pathname;
                                        if (filePathname) {
                                            filename = path_1.default.basename(filePathname);
                                            /* Rewrite the CSS */
                                            rewrittenCss = rewrittenCss.replace(url, filename);
                                            /* Need a rewrite if url doesn't include protocol */
                                            url = U.getFullUrl(webUrlHost, url, cssUrl);
                                            url = url.indexOf('%') < 0 ? encodeURI(url) : url;
                                            /* Download CSS dependency, but avoid duplicate calls */
                                            if (!urlCache.hasOwnProperty(url) && filename) {
                                                urlCache[url] = true;
                                                downloadCSSFileQueue.push({ url: url, path: env.htmlRootPath + dirs.style + '/' + filename });
                                            }
                                        }
                                        else {
                                            logger.warn("Skipping CSS [url(" + url + ")] because the pathname could not be found [" + filePathname + "]");
                                        }
                                    }
                                }
                                fs_1.default.appendFileSync(stylePath, rewrittenCss);
                                finished();
                                return [3 /*break*/, 3];
                            case 2:
                                finished();
                                _a.label = 3;
                            case 3: return [3 /*break*/, 5];
                            case 4:
                                err_2 = _a.sent();
                                finished(err_2);
                                return [3 /*break*/, 5];
                            case 5: return [2 /*return*/];
                        }
                    });
                }); }, speed);
                /* Load main page to see which CSS files are needed */
                downloadContentAndCache(mw.webUrl)
                    .then(function (_a) {
                    var content = _a.content;
                    var html = content.toString();
                    var doc = domino_1.default.createDocument(html);
                    var links = doc.getElementsByTagName('link');
                    /* Go through all CSS links */
                    // tslint:disable-next-line:prefer-for-of
                    for (var i = 0; i < links.length; i += 1) {
                        var link = links[i];
                        if (link.getAttribute('rel') === 'stylesheet') {
                            downloadCSSQueue.push(link);
                        }
                    }
                    /* Push Mediawiki:Offline.css (at the end) */
                    var offlineCssUrl = mw.webUrl + "Mediawiki:offline.css?action=raw";
                    downloadCSSQueue.push(offlineCssUrl);
                    /* Set the drain method to be called one time everything is done */
                    downloadCSSQueue.drain = function drain(error) {
                        if (error) {
                            return reject({ message: "Error in CSS dependencies", error: error });
                        }
                        var drainBackup = downloadCSSQueue.drain;
                        downloadCSSFileQueue.drain = function downloadCSSFileQueueDrain(error) {
                            if (error) {
                                reject({ message: "Error in CSS medias", error: error });
                            }
                            else {
                                downloadCSSQueue.drain = drainBackup;
                                resolve();
                            }
                        };
                        downloadCSSFileQueue.push('');
                    };
                    downloadCSSQueue.push('');
                });
            });
        }
        function getArticleIds(redirectQueue) {
            function drainRedirectQueue(redirectQueue) {
                return new Promise(function (resolve, reject) {
                    redirectQueue.drain = function drain(error) {
                        if (error) {
                            reject("Unable to retrieve redirects for an article: " + error);
                        }
                        else {
                            logger.log('All redirect ids retrieve successfuly.');
                            resolve();
                        }
                    };
                    redirectQueue.push('');
                });
            }
            /* Parse article list given by API */
            function parseAPIResponse(body) {
                var next = '';
                var json = JSON.parse(body);
                var entries = json.query && json.query.pages;
                if (entries) {
                    var redirectQueueValues_1 = [];
                    var details_1 = {};
                    Object.keys(entries).map(function (key) {
                        var entry = entries[key];
                        entry.title = entry.title.replace(/ /g, mw.spaceDelimiter);
                        if ('missing' in entry) {
                            logger.warn("Article " + entry.title + " is not available on this wiki.");
                            delete articleDetailXId[entry.title];
                        }
                        else {
                            redirectQueueValues_1.push(entry.title);
                            if (entry.revisions) {
                                /* Get last revision id */
                                articleDetailXId[entry.title] = Object.assign(articleDetailXId[entry.title] || {}, {
                                    title: entry.title,
                                    oldId: entry.revisions[0].revid,
                                });
                                /* Get last revision id timestamp */
                                var articleDetails = { t: new Date(entry.revisions[0].timestamp).getTime() / 1000 };
                                /* Get article geo coordinates */
                                if (entry.coordinates) {
                                    articleDetails.g = entry.coordinates[0].lat + ";" + entry.coordinates[0].lon;
                                }
                                /* Save as JSON string */
                                details_1[entry.title] = JSON.stringify(articleDetails);
                            }
                            else if (entry.pageid) {
                                logger.warn("Unable to get revisions for " + entry.title + ", but entry exists in the database. Article was probably deleted meanwhile.");
                                delete articleDetailXId[entry.title];
                            }
                            else {
                                throw new Error("Unable to get revisions for " + entry.title + "\nJSON was " + body);
                            }
                        }
                    });
                    if (redirectQueueValues_1.length) {
                        redirectQueue.push(redirectQueueValues_1);
                    }
                    redis.saveArticles(details_1);
                }
                /* Get continue parameters from 'query-continue',
                 * unfortunately old MW version does not use the same way
                 * than recent */
                var continueHash = json['query-continue'] && json['query-continue'].allpages;
                if (continueHash) {
                    Object.keys(continueHash).forEach(function (key) {
                        next += "&" + key + "=" + encodeURIComponent(continueHash[key]);
                    });
                }
                return next;
            }
            function getArticleIdsForLine(redirectQueue, line) {
                return new Promise(function (resolve, reject) {
                    if (line) {
                        var title_1 = line.replace(/ /g, mw.spaceDelimiter).replace('\r', '');
                        var f = function () {
                            downloader.downloadContent.bind(downloader)(mw.articleQueryUrl(title_1))
                                .then(function (_a) {
                                var content = _a.content;
                                var body = content.toString();
                                if (body && body.length > 1) {
                                    parseAPIResponse(body);
                                }
                                setTimeout(resolve, redirectQueue.length());
                            })
                                .catch(reject);
                        };
                        setTimeout(f, redirectQueue.length() > 30000 ? redirectQueue.length() - 30000 : 0);
                    }
                    else {
                        resolve();
                    }
                });
            }
            /* Get ids from file */
            function getArticleIdsForFile() {
                var lines;
                try {
                    lines = fs_1.default.readFileSync(zim.articleList).toString().split('\n');
                }
                catch (error) {
                    return Promise.reject("Unable to open article list file: " + error);
                }
                return new Promise(function (resolve, reject) {
                    async_1.default.eachLimit(lines, speed, function (line, finish) { return getArticleIdsForLine(redirectQueue, line).then(function () { return finish(); }, function (err) { return finish(err); }); }, function (error) {
                        if (error) {
                            reject({ message: "Unable to get all article ids for a file", error: error });
                        }
                        else {
                            logger.log('List of article ids to mirror completed');
                            drainRedirectQueue(redirectQueue).then(resolve, reject);
                        }
                    });
                });
            }
            /* Get ids from Mediawiki API */
            function getArticleIdsForNamespace(namespace, finished) {
                var next = '';
                async_1.default.doWhilst(function (finished) {
                    logger.log("Getting article ids for namespace \"" + namespace + "\" " + (next !== '' ? " (from " + (namespace ? namespace + ":" : '') + next.split('=')[1] + ")" : '') + "...");
                    var url = mw.pageGeneratorQueryUrl(namespace, next);
                    var dc = downloader.downloadContent.bind(downloader);
                    setTimeout(function (url, handler) {
                        dc(url)
                            .then(function (_a) {
                            var content = _a.content;
                            return handler(content);
                        })
                            .catch(function (err) { return finished(err); });
                    }, redirectQueue.length() > 30000 ? redirectQueue.length() - 30000 : 0, url, function (content) {
                        var body = content.toString();
                        if (body && body.length > 1) {
                            next = parseAPIResponse(body);
                            finished();
                        }
                        else {
                            next = '';
                            finished({ message: "Error by retrieving " + url });
                        }
                    });
                }, function () { return next; }, function (error) {
                    if (!error) {
                        logger.log("List of article ids to mirror completed for namespace \"" + namespace + "\"");
                    }
                    finished(error && { message: "Unable to download article ids", error: error });
                });
            }
            function getArticleIdsForNamespaces() {
                return new Promise(function (resolve, reject) {
                    async_1.default.eachLimit(mw.namespacesToMirror, mw.namespacesToMirror.length, getArticleIdsForNamespace, function (error) {
                        if (error) {
                            reject("Unable to get all article ids for in a namespace: " + error);
                        }
                        else {
                            logger.log('All articles ids (but without redirect ids) for all namespaces were successfuly retrieved.');
                            drainRedirectQueue(redirectQueue).then(resolve, reject);
                        }
                    });
                });
            }
            /* Get list of article ids */
            return Utils_1.doSeries([
                function () { return getArticleIdsForLine(redirectQueue, zim.mainPageId); },
                function () {
                    if (zim.articleList) {
                        return getArticleIdsForFile();
                    }
                    else {
                        return getArticleIdsForNamespaces();
                    }
                },
                function () {
                    if (!zim.articleList && !isMirrored(zim.mainPageId)) {
                        return getArticleIdsForLine(redirectQueue, zim.mainPageId);
                    }
                    else {
                        return Promise.resolve();
                    }
                },
            ]);
        }
        /* Multiple developer friendly functions */
        function downloadContentAndCache(url) {
            return new Promise(function (resolve, reject) {
                var cachePath = zim.cacheDirectory + crypto_1.default.createHash('sha1').update(url).digest('hex').substr(0, 20);
                var cacheHeadersPath = cachePath + ".h";
                async_1.default.series([
                    function (finished) {
                        fs_1.default.readFile(cachePath, function (error, data) {
                            finished(error, error ? undefined : data.toString());
                        });
                    },
                    function (finished) {
                        fs_1.default.readFile(cacheHeadersPath, function (error, data) {
                            try {
                                finished(error, error ? undefined : JSON.parse(data.toString()));
                            }
                            catch (error) {
                                finished({ message: "Error in downloadContentAndCache() JSON parsing of " + cacheHeadersPath, error: error });
                            }
                        });
                    },
                ], function (error, results) {
                    if (error) {
                        downloader.downloadContent(url)
                            .then(function (_a) {
                            var content = _a.content, responseHeaders = _a.responseHeaders;
                            if (useCache) {
                                logger.info("Caching " + url + " at " + cachePath + "...");
                                fs_1.default.writeFile(cacheHeadersPath, JSON.stringify(responseHeaders), function () {
                                    fs_1.default.writeFile(cachePath, content, function () {
                                        resolve({ content: content, responseHeaders: responseHeaders });
                                    });
                                });
                            }
                            else {
                                resolve({ content: content, responseHeaders: responseHeaders });
                            }
                        })
                            .catch(function (err) {
                            logger.warn(err);
                            reject(err);
                        });
                    }
                    else {
                        logger.log("Cache hit for " + url + " (" + cachePath + ")");
                        U.touch(cachePath);
                        resolve({ content: results[0], responseHeaders: results[1] });
                    }
                });
            });
        }
        function downloadFileAndCache(url, callback) {
            if (!url) {
                callback();
                return;
            }
            var parts = mediaRegex.exec(decodeURI(url));
            var filenameBase = parts[2].length > parts[5].length
                ? parts[2]
                : parts[5] + (parts[6] || '.svg') + (parts[7] || '');
            var width = parseInt(parts[4].replace(/px-/g, ''), 10) || INFINITY_WIDTH;
            /* Check if we have already met this image during this dumping process */
            redis.getMedia(filenameBase, function (error, rWidth) {
                /* If no redis entry */
                if (error || !rWidth || rWidth < width) {
                    /* Set the redis entry if necessary */
                    redis.saveMedia(filenameBase, width, function () {
                        var mediaPath = getMediaPath(url);
                        var cachePath = zim.cacheDirectory + "m/" + crypto_1.default.createHash('sha1').update(filenameBase).digest('hex').substr(0, 20) + (path_1.default.extname(url_1.default.parse(url, false, true).pathname || '') || '');
                        var cacheHeadersPath = cachePath + ".h";
                        var toDownload = false;
                        /* Check if the file exists in the cache */
                        if (fs_1.default.existsSync(cacheHeadersPath) && fs_1.default.existsSync(cachePath)) {
                            var responseHeaders = void 0;
                            try {
                                responseHeaders = JSON.parse(fs_1.default.readFileSync(cacheHeadersPath).toString());
                            }
                            catch (err) {
                                logger.warn("Error in downloadFileAndCache() JSON parsing of " + cacheHeadersPath, err);
                                responseHeaders = undefined;
                            }
                            /* If the cache file width higher than needed, use it. Otherwise download it and erase the cache */
                            if (!responseHeaders || responseHeaders.width < width) {
                                toDownload = true;
                            }
                            else {
                                fs_1.default.symlink(cachePath, mediaPath, 'file', function (error) {
                                    if (error) {
                                        if (error.code !== 'EEXIST') {
                                            return callback({ message: "Unable to create symlink to " + mediaPath + " at " + cachePath, error: error });
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
                        }
                        else {
                            toDownload = true;
                        }
                        /* Download the file if necessary */
                        if (toDownload) {
                            if (useCache) {
                                downloader.downloadMediaFile(url, cachePath, true, optimizationQueue, function (error) {
                                    if (error) {
                                        callback();
                                    }
                                    else {
                                        logger.info("Caching " + filenameBase + " at " + cachePath + "...");
                                        fs_1.default.symlink(cachePath, mediaPath, 'file', function (error) {
                                            if (error && error.code !== 'EEXIST') {
                                                return callback({ message: "Unable to create symlink to " + mediaPath + " at " + cachePath, error: error });
                                            }
                                            fs_1.default.writeFile(cacheHeadersPath, JSON.stringify({ width: width }), function (error) {
                                                return callback(error && { message: "Unable to write cache header at " + cacheHeadersPath, error: error });
                                            });
                                        });
                                    }
                                });
                            }
                            else {
                                downloader.downloadMediaFile(url, mediaPath, true, optimizationQueue, function (error) {
                                    if (error) {
                                        callback({ message: 'Failed to write file', error: error });
                                    }
                                    else {
                                        callback(null);
                                    }
                                });
                            }
                        }
                        else {
                            logger.info("Cache hit for " + url);
                        }
                    });
                }
                else {
                    /* We already have this image with a resolution equal or higher to what we need */
                    callback();
                }
            });
        }
        /* Internal path/url functions */
        function getMediaBase(url, escape) {
            var root;
            var parts = mediaRegex.exec(decodeURI(url));
            if (parts) {
                root = parts[2].length > parts[5].length ? parts[2] : parts[5] + (parts[6] || '.svg') + (parts[7] || '');
            }
            if (!root) {
                logger.warn("Unable to parse media url \"" + url + "\"");
                return '';
            }
            function e(str) {
                if (typeof str === 'undefined') {
                    return undefined;
                }
                return escape ? encodeURIComponent(str) : str;
            }
            var filenameFirstVariant = parts[2];
            var filenameSecondVariant = parts[5] + (parts[6] || '.svg') + (parts[7] || '');
            var filename = U.decodeURIComponent(filenameFirstVariant.length > filenameSecondVariant.length ? filenameFirstVariant : filenameSecondVariant);
            /* Need to shorten the file due to filesystem limitations */
            if (utf8_binary_cutter_1.default.getBinarySize(filename) > 249) {
                var ext = path_1.default.extname(filename).split('.')[1] || '';
                var basename = filename.substring(0, filename.length - ext.length - 1) || '';
                filename = utf8_binary_cutter_1.default.truncateToBinarySize(basename, 239 - ext.length)
                    + crypto_1.default.createHash('md5').update(basename).digest('hex').substring(0, 2) + "." + ext;
            }
            return dirs.media + "/" + e(filename);
        }
        function getMediaUrl(url) {
            return getMediaBase(url, true);
        }
        function getMediaPath(url, escape) {
            var mediaBase = getMediaBase(url, escape);
            return mediaBase ? env.htmlRootPath + mediaBase : undefined;
        }
        function saveFavicon() {
            var _this = this;
            return new Promise(function (resolve, reject) {
                logger.log('Saving favicon.png...');
                function resizeFavicon(faviconPath) {
                    return new Promise(function (resolve, reject) {
                        var cmd = "convert -thumbnail 48 \"" + faviconPath + "\" \"" + faviconPath + ".tmp\" ; mv \"" + faviconPath + ".tmp\" \"" + faviconPath + "\" ";
                        child_process_1.exec(cmd, function (error) {
                            fs_1.default.stat(faviconPath, function (error, stats) {
                                optimizationQueue.push({ path: faviconPath, size: stats.size }, function () {
                                    if (error) {
                                        reject(error);
                                    }
                                    else {
                                        resolve();
                                    }
                                });
                            });
                        }).on('error', function (error) {
                            reject(error);
                            // console.error(error);
                        });
                    });
                }
                if (customZimFavicon) {
                    var faviconPath = env.htmlRootPath + 'favicon.png';
                    var content = fs_1.default.readFileSync(customZimFavicon);
                    fs_1.default.writeFileSync(faviconPath, content);
                    return resizeFavicon(faviconPath);
                }
                else {
                    downloader.downloadContent(mw.siteInfoUrl())
                        .then(function (_a) {
                        var content = _a.content;
                        var body = content.toString();
                        var entries = JSON.parse(body).query.general;
                        if (!entries.logo) {
                            return reject("********\nNo site Logo Url. Expected a string, but got [" + entries.logo + "].\n\nPlease try specifying a customZimFavicon (--customZimFavicon=./path/to/your/file.ico)\n********");
                        }
                        var parsedUrl = url_1.default.parse(entries.logo);
                        var ext = parsedUrl.pathname.split('.').slice(-1)[0];
                        var faviconPath = env.htmlRootPath + ("favicon." + ext);
                        var faviconFinalPath = env.htmlRootPath + "favicon.png";
                        var logoUrl = parsedUrl.protocol ? entries.logo : 'http:' + entries.logo;
                        downloader.downloadMediaFile(logoUrl, faviconPath, true, optimizationQueue, function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (!(ext !== 'png')) return [3 /*break*/, 2];
                                        logger.info("Original favicon is not a PNG ([" + ext + "]). Converting it to PNG");
                                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                                child_process_1.exec("convert " + faviconPath + " " + faviconFinalPath, function (err) {
                                                    if (err) {
                                                        reject(err);
                                                    }
                                                    else {
                                                        resolve();
                                                    }
                                                });
                                            })];
                                    case 1:
                                        _a.sent();
                                        _a.label = 2;
                                    case 2:
                                        resizeFavicon(faviconFinalPath).then(resolve, reject);
                                        return [2 /*return*/];
                                }
                            });
                        }); });
                    })
                        .catch(reject);
                }
            });
        }
        function getMainPage() {
            function writeMainPage(html) {
                var mainPagePath = env.htmlRootPath + "index.htm";
                if (env.deflateTmpHtml) {
                    return new Promise(function (resolve, reject) {
                        zlib_1.default.deflate(html, function (error, deflatedHtml) {
                            Utils_1.writeFilePromise(mainPagePath, deflatedHtml).then(resolve, reject);
                        });
                    });
                }
                else {
                    return Utils_1.writeFilePromise(mainPagePath, html);
                }
            }
            function createMainPage() {
                logger.log('Creating main page...');
                var doc = domino_1.default.createDocument(articleListHomeTemplate
                    .replace('</head>', genHeaderCSSLink('mobile_main_page_nojs', 'nojs') + '\n' +
                    genHeaderCSSLink('style') + '\n' +
                    genHeaderScript('images_loaded.min') + '\n' +
                    genHeaderScript('masonry.min') + '\n' +
                    genHeaderScript('article_list_home') + '\n' +
                    '\n</head>'));
                var titles = Object.keys(articleDetailXId).sort();
                var _a = titles.reduce(function (acc, title) {
                    var articleDetail = articleDetailXId[title];
                    if (articleDetail.thumbnail) {
                        acc.articlesWithImages.push(articleDetail);
                    }
                    else {
                        acc.articlesWithoutImages.push(articleDetail);
                    }
                    return acc;
                }, {
                    articlesWithImages: [],
                    articlesWithoutImages: [],
                }), articlesWithImages = _a.articlesWithImages, articlesWithoutImages = _a.articlesWithoutImages;
                var articlesWithImagesEl = articlesWithImages.map(function (article) { return U.makeArticleImageTile(env, article); }).join('\n');
                // const articlesWithoutImagesEl = articlesWithoutImages.map((article) => U.makeArticleListItem(env, article)).join('\n');
                var dumpTitle = customZimTitle || (new URL(mwUrl)).host;
                // doc.getElementById('title').textContent = dumpTitle;
                doc.getElementById('content').innerHTML = articlesWithImagesEl;
                // doc.getElementById('list').innerHTML = articlesWithoutImagesEl;
                /* Write the static html file */
                return writeMainPage(doc.documentElement.outerHTML);
            }
            function createMainPageRedirect() {
                logger.log('Create main page redirection...');
                var html = redirectTemplate({
                    title: zim.mainPageId.replace(/_/g, ' '),
                    target: env.getArticleBase(zim.mainPageId, true),
                });
                return writeMainPage(html);
            }
            if (zim.mainPageId) {
                return createMainPageRedirect();
            }
            else {
                return createMainPage();
            }
        }
        var _speed, adminEmail, localParsoid, customZimFavicon, verbose, minifyHtml, skipCacheCleaning, keepEmptyParagraphs, mwUrl, mwWikiPath, mwApiPath, mwDomain, mwUsername, mwPassword, requestTimeout, publisher, articleList, customMainPage, customZimTitle, customZimDescription, customZimTags, cacheDirectory, outputDirectory, tmpDirectory, withZimFullTextIndex, format, filenamePrefix, keepHtml, resume, deflateTmpHtml, writeHtmlRedirects, _addNamespaces, _useCache, parsoidUrl, useCache, cpuCount, speed, logger, nodeVersionSatisfiesPackage, mw, downloader, creator, zimOpts, zim, env, INFINITY_WIDTH, articleDetailXId, webUrlHost, parsoidContentType, addNamespaces, articleListLines, redis, dirs, cssLinks, jsScripts, redirectTemplate, footerTemplate, leadSectionTemplate, sectionTemplate, subSectionTemplate, genericJsModules, genericCssModules, mediaRegex, htmlTemplateCode, articleListHomeTemplate, optimizationQueue, downloadFileQueue, redirectQueue;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _speed = argv.speed, adminEmail = argv.adminEmail, localParsoid = argv.localParsoid, customZimFavicon = argv.customZimFavicon, verbose = argv.verbose, minifyHtml = argv.minifyHtml, skipCacheCleaning = argv.skipCacheCleaning, keepEmptyParagraphs = argv.keepEmptyParagraphs, mwUrl = argv.mwUrl, mwWikiPath = argv.mwWikiPath, mwApiPath = argv.mwApiPath, mwDomain = argv.mwDomain, mwUsername = argv.mwUsername, mwPassword = argv.mwPassword, requestTimeout = argv.requestTimeout, publisher = argv.publisher, articleList = argv.articleList, customMainPage = argv.customMainPage, customZimTitle = argv.customZimTitle, customZimDescription = argv.customZimDescription, customZimTags = argv.customZimTags, cacheDirectory = argv.cacheDirectory, outputDirectory = argv.outputDirectory, tmpDirectory = argv.tmpDirectory, withZimFullTextIndex = argv.withZimFullTextIndex, format = argv.format, filenamePrefix = argv.filenamePrefix, keepHtml = argv.keepHtml, resume = argv.resume, deflateTmpHtml = argv.deflateTmpHtml, writeHtmlRedirects = argv.writeHtmlRedirects, _addNamespaces = argv.addNamespaces, _useCache = argv.useCache;
                    parsoidUrl = argv.parsoidUrl;
                    useCache = typeof _useCache === 'undefined' ? true : _useCache;
                    /* HTTP user-agent string */
                    // const adminEmail = argv.adminEmail;
                    if (!U.isValidEmail(adminEmail)) {
                        throw new Error("Admin email [" + adminEmail + "] is not valid");
                    }
                    /* ZIM custom Favicon */
                    if (customZimFavicon && !fs_1.default.existsSync(customZimFavicon)) {
                        throw new Error("Path " + customZimFavicon + " is not a valid PNG file.");
                    }
                    /* Number of parallel requests */
                    if (_speed && isNaN(_speed)) {
                        throw new Error('speed is not a number, please give a number value to --speed');
                    }
                    cpuCount = os_1.default.cpus().length;
                    speed = cpuCount * (_speed || 1);
                    /* Necessary to avoid problems with https */
                    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
                    logger = new Logger_1.default(verbose);
                    nodeVersionSatisfiesPackage = semver_1.default.satisfies(process.version, package_json_1.default.engines.node);
                    if (!nodeVersionSatisfiesPackage) {
                        logger.warn("***********\n\n\tCurrent node version is [" + process.version + "]. We recommend [" + package_json_1.default.engines.node + "]\n\n***********");
                    }
                    mw = new MediaWiki_1.default(logger, {
                        apiPath: mwApiPath,
                        base: mwUrl,
                        domain: mwDomain,
                        password: mwPassword,
                        spaceDelimiter: '_',
                        username: mwUsername,
                        wikiPath: mwWikiPath,
                    });
                    downloader = new Downloader_1.default(logger, mw, config_1.default.userAgent + " (" + adminEmail + ")", requestTimeout || config_1.default.defaults.requestTimeout);
                    creator = Utils_1.getCreatorName(mw);
                    zimOpts = {
                        // Name to use for ZIM (content) creator
                        creator: creator,
                        // ZIM publisher
                        publisher: publisher || config_1.default.defaults.publisher,
                        langIso2: 'en',
                        langIso3: 'eng',
                        // List of articles is maybe in a file
                        articleList: articleList,
                        mainPageId: customMainPage || '',
                        name: customZimTitle || '',
                        description: customZimDescription || '',
                        tags: customZimTags || '',
                        cacheDirectory: (cacheDirectory || path_1.default.resolve(process.cwd(), 'cac')) + "/",
                        // File where redirects might be save if --writeHtmlRedirects is not set
                        redirectsCacheFile: null,
                        // Directory wehre everything is saved at the end of the process
                        outputDirectory: outputDirectory,
                        // Directory where temporary data are saved
                        tmpDirectory: tmpDirectory,
                        // Include fulltext index in ZIM file
                        withZimFullTextIndex: withZimFullTextIndex,
                        // What is this?
                        subTitle: '',
                    };
                    zim = new Zim_1.default(config_1.default, zimOpts);
                    env = new OfflinerEnv_1.default(format, {
                        zim: zim,
                        mw: mw,
                        logger: logger,
                        downloader: downloader,
                        verbose: verbose,
                        // Prefix part of the filename (radical)
                        filenamePrefix: filenamePrefix || '',
                        // If ZIM is built, should temporary HTML directory be kept
                        keepHtml: keepHtml,
                        // Should we keep ZIM file generation if ZIM file already exists
                        resume: resume,
                        deflateTmpHtml: deflateTmpHtml,
                        // How to write redirects
                        writeHtmlRedirects: writeHtmlRedirects,
                    });
                    INFINITY_WIDTH = 9999999;
                    articleDetailXId = {};
                    webUrlHost = url_1.default.parse(mw.webUrl).host;
                    parsoidContentType = 'html';
                    addNamespaces = _addNamespaces ? String(_addNamespaces).split(',').map(function (a) { return Number(a); }) : [];
                    articleListLines = articleList ? fs_1.default.readFileSync(zim.articleList).toString().split('\n') : [];
                    if (!!parsoidUrl) return [3 /*break*/, 3];
                    if (!localParsoid) return [3 /*break*/, 2];
                    logger.log('Starting Parsoid');
                    // Icky but necessary
                    fs_1.default.writeFileSync('./localsettings.js', "\n                exports.setup = function(parsoidConfig) {\n                    parsoidConfig.setMwApi({\n                        uri: '" + (mw.base + mw.apiPath) + "',\n                    });\n                };\n                ", 'utf8');
                    return [4 /*yield*/, parsoid_1.default
                            .apiServiceWorker({
                            appBasePath: './node_modules/parsoid',
                            logger: console,
                            config: {
                                localsettings: '../../localsettings.js',
                                parent: undefined,
                            },
                        })
                            .then(function (_) {
                            fs_1.default.unlinkSync('./localsettings.js');
                            logger.log('Parsoid Started Successfully');
                        })];
                case 1:
                    _a.sent();
                    parsoidUrl = "http://localhost:8000/" + webUrlHost + "/v3/page/pagebundle/";
                    parsoidContentType = 'json';
                    return [3 /*break*/, 3];
                case 2:
                    parsoidUrl = mw.apiUrl + "action=visualeditor&format=json&paction=parse&page=";
                    parsoidContentType = 'json';
                    _a.label = 3;
                case 3: 
                /* ********************************* */
                /* RUNNING CODE ******************** */
                /* ********************************* */
                return [4 /*yield*/, Utils_1.checkDependencies(env)];
                case 4:
                    /* ********************************* */
                    /* RUNNING CODE ******************** */
                    /* ********************************* */
                    _a.sent();
                    redis = new redis_1.default(env, argv, config_1.default);
                    dirs = config_1.default.output.dirs;
                    cssLinks = config_1.default.output.cssResources.reduce(function (buf, css) {
                        return buf + genHeaderCSSLink(css);
                    }, '');
                    jsScripts = config_1.default.output.jsResources.reduce(function (buf, js) {
                        return buf + genHeaderScript(js);
                    }, '');
                    redirectTemplate = swig_templates_1.default.compile(readTemplate(config_1.default.output.templates.redirects));
                    footerTemplate = swig_templates_1.default.compile(readTemplate(config_1.default.output.templates.footer));
                    leadSectionTemplate = swig_templates_1.default.compile(readTemplate(config_1.default.output.templates.lead_section_wrapper));
                    sectionTemplate = swig_templates_1.default.compile(readTemplate(config_1.default.output.templates.section_wrapper));
                    subSectionTemplate = swig_templates_1.default.compile(readTemplate(config_1.default.output.templates.subsection_wrapper));
                    genericJsModules = config_1.default.output.mw.js;
                    genericCssModules = config_1.default.output.mw.css;
                    mediaRegex = /^(.*\/)([^/]+)(\/)(\d+px-|)(.+?)(\.[A-Za-z0-9]{2,6}|)(\.[A-Za-z0-9]{2,6}|)$/;
                    htmlTemplateCode = readTemplate(config_1.default.output.templates.page)
                        .replace('__CSS_LINKS__', cssLinks)
                        .replace('__JS_SCRIPTS__', jsScripts);
                    articleListHomeTemplate = readTemplate(config_1.default.output.templates.articleListHomeTemplate);
                    optimizationQueue = async_1.default.queue(function (file, finished) {
                        var path = file.path;
                        function getOptimizationCommand(path, forcedType) {
                            var ext = path_1.default.extname(path).split('.')[1] || '';
                            var basename = path.substring(0, path.length - ext.length - 1) || '';
                            var tmpExt = "." + U.randomString(5) + "." + ext;
                            var tmpPath = basename + tmpExt;
                            var type = forcedType || ext;
                            /* Escape paths */
                            path = path.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
                            tmpPath = tmpPath.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
                            if (type === 'jpg' || type === 'jpeg' || type === 'JPG' || type === 'JPEG') {
                                return "jpegoptim --strip-all --force --all-normal -m60 \"" + path + "\"";
                            }
                            if (type === 'png' || type === 'PNG') {
                                return ("pngquant --verbose --strip --nofs --force --ext=\"" + tmpExt + "\" \"" + path + "\" &&          advdef -q -z -4 -i 5 \"" + tmpPath + "\" &&          if [ $(stat -c%s \"" + tmpPath + "\") -lt $(stat -c%s \"" + path + "\") ]; then mv \"" + tmpPath + "\" \"" + path + "\"; else rm \"" + tmpPath + "\"; fi");
                            }
                            if (type === 'gif' || type === 'GIF') {
                                return ("gifsicle --verbose --colors 64 -O3 \"" + path + "\" -o \"" + tmpPath + "\" &&          if [ $(stat -c%s \"" + tmpPath + "\") -lt $(stat -c%s \"" + path + "\") ]; then mv \"" + tmpPath + "\" \"" + path + "\"; else rm \"" + tmpPath + "\"; fi");
                            }
                        }
                        if (!path || !file.size) {
                            finished();
                            return;
                        }
                        fs_1.default.stat(path, function (preOptimError, preOptimStats) {
                            if (preOptimError) {
                                logger.error("Failed to start to optim " + path + " - file was probably deleted:", preOptimError);
                                finished();
                                return;
                            }
                            var cmd = getOptimizationCommand(path);
                            if (!cmd) {
                                finished();
                                return;
                            }
                            async_1.default.retry(5, function (finished) {
                                logger.info("Executing command : " + cmd);
                                if (!cmd) {
                                    finished(null, 'No optim command, skipping file');
                                    return;
                                }
                                child_process_1.exec(cmd, function (executionError) {
                                    if (!executionError) {
                                        finished();
                                        return;
                                    }
                                    fs_1.default.stat(path, function (postOptimError, postOptimStats) {
                                        if (!postOptimError && postOptimStats.size > preOptimStats.size) {
                                            finished(null, true);
                                        }
                                        else if (!postOptimError && postOptimStats.size < preOptimStats.size) {
                                            finished('File to optim is smaller (before optim) than it should.');
                                        }
                                        else {
                                            child_process_1.exec("file -b --mime-type \"" + path + "\"", function (error, stdout) {
                                                var type = stdout.replace(/image\//, '').replace(/[\n\r]/g, '');
                                                cmd = getOptimizationCommand(path, type);
                                                if (cmd) {
                                                    setTimeout(finished, 2000, executionError);
                                                }
                                                else {
                                                    finished('Unable to find optimization command.');
                                                }
                                            });
                                        }
                                    });
                                });
                            }, function (error, skip) {
                                if (error) {
                                    logger.warn("Failed to optim " + path + ", with size=" + file.size + " (" + error + ")");
                                }
                                else if (skip) {
                                    logger.info("Optimization skipped for " + path + ", with size='" + file.size + ", a better version was downloaded meanwhile.");
                                }
                                else {
                                    logger.info("Successfuly optimized " + path);
                                }
                                finished();
                            });
                        });
                    }, cpuCount * 2);
                    downloadFileQueue = async_1.default.queue(function (url, finished) {
                        downloadFileAndCache(url, finished);
                    }, speed * 5);
                    redirectQueue = async_1.default.queue(function (articleId, finished) { return __awaiter(_this, void 0, void 0, function () {
                        var url, content, body, redirects_1, redirectsCount_1, pages, err_3;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    if (!articleId) return [3 /*break*/, 5];
                                    logger.info("Getting redirects for article " + articleId + "...");
                                    url = mw.backlinkRedirectsQueryUrl(articleId);
                                    _a.label = 1;
                                case 1:
                                    _a.trys.push([1, 3, , 4]);
                                    return [4 /*yield*/, downloader.downloadContent(url)];
                                case 2:
                                    content = (_a.sent()).content;
                                    body = content.toString();
                                    if (!JSON.parse(body).error) {
                                        redirects_1 = {};
                                        redirectsCount_1 = 0;
                                        pages = JSON.parse(body).query.pages;
                                        pages[Object.keys(pages)[0]].redirects.map(function (entry) {
                                            var title = entry.title.replace(/ /g, mw.spaceDelimiter);
                                            redirects_1[title] = articleId;
                                            redirectsCount_1 += 1;
                                            if (title === zim.mainPageId) {
                                                zim.mainPageId = articleId;
                                            }
                                        });
                                        logger.info(redirectsCount_1 + " redirect(s) found for " + articleId);
                                        redis.saveRedirects(redirectsCount_1, redirects_1, finished);
                                    }
                                    else {
                                        finished(JSON.parse(body).error);
                                    }
                                    return [3 /*break*/, 4];
                                case 3:
                                    err_3 = _a.sent();
                                    finished(err_3);
                                    return [3 /*break*/, 4];
                                case 4: return [3 /*break*/, 6];
                                case 5:
                                    finished();
                                    _a.label = 6;
                                case 6: return [2 /*return*/];
                            }
                        });
                    }); }, speed * 3);
                    /* ********************************* */
                    /* GET CONTENT ********************* */
                    /* ********************************* */
                    return [4 /*yield*/, mw.login(downloader)];
                case 5:
                    /* ********************************* */
                    /* GET CONTENT ********************* */
                    /* ********************************* */
                    _a.sent();
                    return [4 /*yield*/, mw.getTextDirection(env, downloader)];
                case 6:
                    _a.sent();
                    return [4 /*yield*/, mw.getSiteInfo(env, downloader)];
                case 7:
                    _a.sent();
                    return [4 /*yield*/, zim.getSubTitle()];
                case 8:
                    _a.sent();
                    return [4 /*yield*/, mw.getNamespaces(addNamespaces, downloader)];
                case 9:
                    _a.sent();
                    return [4 /*yield*/, zim.createDirectories()];
                case 10:
                    _a.sent();
                    if (!useCache) return [3 /*break*/, 12];
                    return [4 /*yield*/, zim.prepareCache()];
                case 11:
                    _a.sent();
                    _a.label = 12;
                case 12: return [4 /*yield*/, env.checkResume()];
                case 13:
                    _a.sent();
                    return [4 /*yield*/, getArticleIds(redirectQueue)];
                case 14:
                    _a.sent();
                    if (!useCache) return [3 /*break*/, 16];
                    return [4 /*yield*/, cacheRedirects()];
                case 15:
                    _a.sent();
                    _a.label = 16;
                case 16: return [4 /*yield*/, Utils_1.doSeries(env.dumps.map(function (dump) {
                        return function () { return doDump(env, dump); };
                    }))];
                case 17:
                    _a.sent();
                    if (!(!useCache || skipCacheCleaning)) return [3 /*break*/, 19];
                    logger.log('Skipping cache cleaning...');
                    return [4 /*yield*/, child_process_1.exec("rm -f \"" + zim.cacheDirectory + "ref\"")];
                case 18:
                    _a.sent();
                    return [3 /*break*/, 21];
                case 19:
                    logger.log('Cleaning cache');
                    return [4 /*yield*/, child_process_1.exec("find \"" + zim.cacheDirectory + "\" -type f -not -newer \"" + zim.cacheDirectory + "ref\" -exec rm {} \\;")];
                case 20:
                    _a.sent();
                    _a.label = 21;
                case 21: return [4 /*yield*/, redis.flushDBs()];
                case 22:
                    _a.sent();
                    return [4 /*yield*/, redis.quit()];
                case 23:
                    _a.sent();
                    logger.log('Closing HTTP agents...');
                    return [4 /*yield*/, closeAgents()];
                case 24:
                    _a.sent();
                    logger.log('All dumping(s) finished with success.');
                    return [2 /*return*/];
            }
        });
    });
}
exports.execute = execute;
