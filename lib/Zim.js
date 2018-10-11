"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var async_1 = __importDefault(require("async"));
var case_insensitive_1 = __importDefault(require("case-insensitive"));
var child_process_1 = require("child_process");
var domino_1 = __importDefault(require("domino"));
var expand_home_dir_1 = __importDefault(require("expand-home-dir"));
var fs_1 = __importDefault(require("fs"));
var mkdirp_1 = __importDefault(require("mkdirp"));
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
                function (finished) { mkdirp_1.default(self.outputDirectory, finished); },
                function (finished) { mkdirp_1.default(self.tmpDirectory, finished); },
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
        // U.exitIfError(error, `Unable to create mandatory directories : ${error}`);
    };
    Zim.prototype.prepareCache = function () {
        var _this = this;
        var self = this;
        var env = self.env;
        return new Promise(function (resolve, reject) {
            env.logger.log('Preparing cache...');
            _this.cacheDirectory = _this.cacheDirectory + env.computeFilenameRadical(true, true, true) + "/";
            _this.redirectsCacheFile = _this.cacheDirectory + env.computeFilenameRadical(false, true, true) + ".redirects";
            mkdirp_1.default(_this.cacheDirectory + "m/", function (err) {
                if (err) {
                    reject(err);
                }
                else {
                    fs_1.default.writeFileSync(self.cacheDirectory + "ref", '42');
                    resolve();
                }
            });
        });
    };
    Zim.prototype.getSubTitle = function () {
        var env = this.env;
        return new Promise(function (resolve, reject) {
            env.logger.log('Getting sub-title...');
            env.downloader.downloadContent(env.mw.webUrl, function (content) {
                var html = content.toString();
                var doc = domino_1.default.createDocument(html);
                var subTitleNode = doc.getElementById('siteSub');
                env.zim.subTitle = subTitleNode ? subTitleNode.innerHTML : '';
                resolve();
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
                        console.error("STDOUT output error: " + error);
                    });
                }
                if (!nostderr) {
                    proc.stderr.on('data', function (data) {
                        console.error(data.toString().replace(/[\n\r]/g, ''));
                    })
                        .on('error', function (error) {
                        console.error("STDERR output error: " + error);
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
                        env.writeHtmlRedirects ? '' : "--redirects=" + zim.redirectsCacheFile,
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
                }).on('error', function (error) { console.error(error); });
            });
        }
        else {
            return Promise.resolve();
        }
    };
    return Zim;
}());
exports.default = Zim;
