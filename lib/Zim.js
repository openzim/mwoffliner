"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
var async_1 = __importDefault(require("async"));
var case_insensitive_1 = __importDefault(require("case-insensitive"));
var child_process_1 = require("child_process");
var domino_1 = __importDefault(require("domino"));
var expand_home_dir_1 = __importDefault(require("expand-home-dir"));
var path_1 = __importDefault(require("path"));
var url_1 = __importDefault(require("url"));
var Utils_1 = require("./Utils");
var Zim = /** @class */ (function () {
    function Zim(config, args) {
        this.config = config;
        Object.assign(this, args);
        // Normalize
        this.outputDirectory = this.outputDirectory ? expand_home_dir_1.default(this.outputDirectory) + "/" : 'out/';
        this.tmpDirectory = this.tmpDirectory ? expand_home_dir_1.default(this.tmpDirectory) + "/" : 'tmp/';
    }
    Zim.prototype.createDirectories = function () {
        this.env.logger.log('Creating base directories...');
        var self = this;
        return new Promise(function (resolve, reject) {
            async_1.default.series([
                function (finished) { Utils_1.mkdirPromise(self.outputDirectory).then(finished, finished); },
                function (finished) { Utils_1.mkdirPromise(self.tmpDirectory).then(finished, finished); },
            ], function (error) {
                if (error) {
                    reject("Unable to create mandatory directories : " + error);
                }
                else {
                    resolve();
                }
            });
        });
    };
    /* Create directories for static files */
    Zim.prototype.createSubDirectories = function () {
        var _a = this, env = _a.env, config = _a.config;
        var dirs = config.output.dirs;
        env.logger.log("Creating sub directories at \"" + env.htmlRootPath + "\"...");
        return Utils_1.doSeries([
            function () { return Utils_1.execPromise("rm -rf \"" + env.htmlRootPath + "\""); },
            function () { return Utils_1.mkdirPromise(env.htmlRootPath); },
            function () { return Utils_1.mkdirPromise(env.htmlRootPath + dirs.style); },
            function () { return Utils_1.mkdirPromise(env.htmlRootPath + dirs.style + "/" + dirs.styleModules); },
            function () { return Utils_1.mkdirPromise(env.htmlRootPath + dirs.media); },
            function () { return Utils_1.mkdirPromise(env.htmlRootPath + dirs.javascript); },
            function () { return Utils_1.mkdirPromise(env.htmlRootPath + dirs.javascript + "/" + dirs.jsModules); },
        ]);
    };
    Zim.prototype.prepareCache = function () {
        var self = this;
        var env = self.env;
        env.logger.log('Preparing cache...');
        this.cacheDirectory = this.cacheDirectory + env.computeFilenameRadical(true, true, true) + "/";
        this.redirectsCacheFile = this.cacheDirectory + env.computeFilenameRadical(false, true, true) + ".redirects";
        return Utils_1.mkdirPromise(this.cacheDirectory + "m/");
    };
    Zim.prototype.getSubTitle = function () {
        return __awaiter(this, void 0, void 0, function () {
            var env, content, html, doc, subTitleNode;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        env = this.env;
                        env.logger.log('Getting sub-title...');
                        return [4 /*yield*/, env.downloader.downloadContent(env.mw.webUrl)];
                    case 1:
                        content = (_a.sent()).content;
                        html = content.toString();
                        doc = domino_1.default.createDocument(html);
                        subTitleNode = doc.getElementById('siteSub');
                        env.zim.subTitle = subTitleNode ? subTitleNode.innerHTML : '';
                        return [2 /*return*/];
                }
            });
        });
    };
    Zim.prototype.computeZimRootPath = function () {
        var zimRootPath = this.outputDirectory[0] === '/' ? this.outputDirectory : path_1.default.resolve(process.cwd(), this.outputDirectory) + "/";
        zimRootPath += this.env.computeFilenameRadical() + ".zim";
        return zimRootPath;
    };
    Zim.prototype.computeZimName = function () {
        return (this.publisher ? this.publisher.toLowerCase() + "." : '') + this.env.computeFilenameRadical(false, true, true);
    };
    Zim.prototype.computeZimTags = function () {
        var tags = this.tags.split(';');
        /* Mediawiki hostname radical */
        var mwUrlHostParts = url_1.default.parse(this.env.mw.base).host.split('.');
        var mwUrlHostPartsTag = mwUrlHostParts.length > 1
            ? mwUrlHostParts[mwUrlHostParts.length - 2]
            : mwUrlHostParts[mwUrlHostParts.length - 1];
        if (case_insensitive_1.default(tags).indexOf(mwUrlHostPartsTag.toLowerCase()) === -1) {
            tags.push(mwUrlHostPartsTag.toLowerCase());
        }
        /* novid/nopic */
        if (this.env.nopic) {
            tags.push('nopic');
        }
        else if (this.env.novid) {
            tags.push('novid');
        }
        else if (this.env.nopdf) {
            tags.push('nopdf');
        }
        /* nodet */
        if (this.env.nodet) {
            tags.push('nodet');
        }
        /* Remove empty elements */
        tags = tags.filter(function (x) { return (x !== (undefined || null || '')); });
        return tags.join(';');
    };
    Zim.prototype.executeTransparently = function (command, args, nostdout, nostderr) {
        var logger = this.env.logger;
        return new Promise(function (resolve, reject) {
            try {
                var proc = child_process_1.spawn(command, args).on('error', function (error) {
                    if (error) {
                        reject("Error in executeTransparently(), " + error);
                    }
                });
                if (!nostdout) {
                    proc.stdout.on('data', function (data) {
                        logger.log(data.toString().replace(/[\n\r]/g, ''));
                    })
                        .on('error', function (error) {
                        logger.error("STDOUT output error: " + error);
                    });
                }
                if (!nostderr) {
                    proc.stderr.on('data', function (data) {
                        logger.error(data.toString().replace(/[\n\r]/g, ''));
                    })
                        .on('error', function (error) {
                        logger.error("STDERR output error: " + error);
                    });
                }
                proc.on('close', function (code) {
                    var isError = code !== 0;
                    if (isError) {
                        reject("Error when executing " + command);
                    }
                    else {
                        resolve();
                    }
                });
            }
            catch (error) {
                reject("Error when executing " + command);
            }
        });
    };
    Zim.prototype.buildZIM = function () {
        var env = this.env;
        var zim = this;
        var logger = this.env.logger;
        if (!env.nozim) {
            return new Promise(function (resolve, reject) {
                child_process_1.exec('sync', function () {
                    var zimPath = zim.computeZimRootPath();
                    var zimTags = zim.computeZimTags();
                    var cmd = "zimwriterfs --welcome=index.htm --favicon=favicon.png --language=" + zim.langIso3 + (zim.mainPageId ? " --welcome=" + env.getArticleBase(zim.mainPageId) : ' --welcome=index.htm') + (env.deflateTmpHtml ? ' --inflateHtml ' : '') + (env.verbose ? ' --verbose ' : '') + (zimTags ? " --tags=\"" + zimTags + "\"" : '') + " --name=\"" + zim.computeZimName() + "\"" + (zim.withZimFullTextIndex ? ' --withFullTextIndex' : '') + (env.writeHtmlRedirects ? '' : " --redirects=\"" + zim.redirectsCacheFile + "\"") + " --title=\"" + zim.name + "\" --description=\"" + (zim.description || zim.subTitle || zim.name) + "\" --creator=\"" + zim.creator + "\" --publisher=\"" + zim.publisher + "\" \"" + env.htmlRootPath + "\" \"" + zimPath + "\"";
                    logger.log("Building ZIM file " + zimPath + " (" + cmd + ")...");
                    logger.log("RAID: " + zim.computeZimName());
                    zim.executeTransparently('zimwriterfs', [
                        env.deflateTmpHtml ? '--inflateHtml' : '',
                        env.verbose ? '--verbose' : '',
                        env.writeHtmlRedirects || !zim.redirectsCacheFile /* Not set when useCache=false */ ? '' : "--redirects=" + zim.redirectsCacheFile,
                        zim.withZimFullTextIndex ? '--withFullTextIndex' : '',
                        zimTags ? "--tags=" + zimTags : '',
                        zim.mainPageId ? "--welcome=" + env.getArticleBase(zim.mainPageId) : '--welcome=index.htm',
                        '--favicon=favicon.png',
                        "--language=" + zim.langIso3,
                        "--title=" + zim.name,
                        "--name=" + zim.computeZimName(),
                        "--description=" + (zim.description || zim.subTitle || zim.name),
                        "--creator=" + zim.creator,
                        "--publisher=" + zim.publisher,
                        env.htmlRootPath,
                        zimPath,
                    ], !env.verbose, !env.verbose)
                        .then(function () {
                        logger.log("ZIM file built at " + zimPath);
                        /* Delete the html directory ? */
                        if (env.keepHtml) {
                            resolve();
                        }
                        else {
                            Utils_1.execPromise("rm -rf \"" + env.htmlRootPath + "\"").then(resolve, reject);
                        }
                    })
                        .catch(function (error) {
                        reject("Failed to build successfuly the ZIM file " + zimPath + " (" + error + ")");
                    });
                }).on('error', function (error) { logger.error(error); });
            });
        }
        else {
            return Promise.resolve();
        }
    };
    return Zim;
}());
exports.default = Zim;
