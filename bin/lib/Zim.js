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
var Utils_1 = __importDefault(require("./Utils"));
var Zim = /** @class */ (function () {
    function Zim(config, args) {
        this.config = config;
        Object.assign(this, args);
        // Normalize
        this.outputDirectory = this.outputDirectory ? expand_home_dir_1.default(this.outputDirectory) + "/" : 'out/';
        this.tmpDirectory = this.tmpDirectory ? expand_home_dir_1.default(this.tmpDirectory) + "/" : 'tmp/';
    }
    Zim.prototype.createDirectories = function (cb) {
        this.env.logger.log('Creating base directories...');
        var self = this;
        async_1.default.series([
            function (finished) { mkdirp_1.default(self.outputDirectory, finished); },
            function (finished) { mkdirp_1.default(self.tmpDirectory, finished); },
        ], function (error) {
            Utils_1.default.exitIfError(error, "Unable to create mandatory directories : " + error);
            cb();
        });
    };
    /* Create directories for static files */
    Zim.prototype.createSubDirectories = function (cb) {
        var _a = this, env = _a.env, config = _a.config;
        var dirs = config.output.dirs;
        env.logger.log("Creating sub directories at \"" + env.htmlRootPath + "\"...");
        async_1.default.series([
            function (finished) { return child_process_1.exec("rm -rf \"" + env.htmlRootPath + "\"", finished); },
            function (finished) { return fs_1.default.mkdir(env.htmlRootPath, undefined, finished); },
            function (finished) { return fs_1.default.mkdir(env.htmlRootPath + dirs.style, undefined, finished); },
            function (finished) { return fs_1.default.mkdir(env.htmlRootPath + dirs.style + "/" + dirs.styleModules, undefined, finished); },
            function (finished) { return fs_1.default.mkdir(env.htmlRootPath + dirs.media, undefined, finished); },
            function (finished) { return fs_1.default.mkdir(env.htmlRootPath + dirs.javascript, undefined, finished); },
            function (finished) { return fs_1.default.mkdir(env.htmlRootPath + dirs.javascript + "/" + dirs.jsModules, undefined, finished); },
        ], function (error) {
            Utils_1.default.exitIfError(error, "Unable to create mandatory directories : " + error);
            cb();
        });
    };
    Zim.prototype.prepareCache = function (cb) {
        var env = this.env;
        var self = this;
        env.logger.log('Preparing cache...');
        this.cacheDirectory = this.cacheDirectory + env.computeFilenameRadical(true, true, true) + "/";
        this.redirectsCacheFile = this.cacheDirectory + env.computeFilenameRadical(false, true, true) + ".redirects";
        mkdirp_1.default(this.cacheDirectory + "m/", function () {
            fs_1.default.writeFileSync(self.cacheDirectory + "ref", '42');
            cb();
        });
    };
    Zim.prototype.getSubTitle = function (cb) {
        var env = this.env;
        env.logger.log('Getting sub-title...');
        env.downloader.downloadContent(env.mw.webUrl, function (content) {
            var html = content.toString();
            var doc = domino_1.default.createDocument(html);
            var subTitleNode = doc.getElementById('siteSub');
            env.zim.subTitle = subTitleNode ? subTitleNode.innerHTML : '';
            cb();
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
    Zim.prototype.executeTransparently = function (command, args, callback, nostdout, nostderr) {
        var logger = this.env.logger;
        try {
            var proc = child_process_1.spawn(command, args).on('error', function (error) {
                Utils_1.default.exitIfError(error, "Error in executeTransparently(), " + error);
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
                callback(code !== 0 ? "Error when executing " + command : undefined);
            });
        }
        catch (error) {
            callback("Error when executing " + command);
        }
    };
    Zim.prototype.buildZIM = function (cb) {
        var env = this.env;
        var zim = this;
        var logger = this.env.logger;
        if (!env.nozim) {
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
                ], function (error) {
                    Utils_1.default.exitIfError(error, "Failed to build successfuly the ZIM file " + zimPath + " (" + error + ")");
                    logger.log("ZIM file built at " + zimPath);
                    /* Delete the html directory ? */
                    if (env.keepHtml) {
                        cb();
                    }
                    else {
                        child_process_1.exec("rm -rf \"" + env.htmlRootPath + "\"", cb);
                    }
                }, !env.verbose, !env.verbose);
            }).on('error', function (error) { console.error(error); });
        }
        else {
            cb();
        }
    };
    return Zim;
}());
exports.default = Zim;
