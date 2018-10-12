"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = __importDefault(require("fs"));
var path_1 = __importDefault(require("path"));
var url_1 = __importDefault(require("url"));
// This is just a refactoring stub for now.
// Eventually, we want a MWOffliner object that might swallow this.
var OfflinerEnv = /** @class */ (function () {
    function OfflinerEnv(format, envObjs) {
        Object.assign(this, envObjs);
        // output config (FIXME: Does this belong in Zim?)
        this.nopic = false;
        this.novid = false;
        this.nozim = false;
        this.nodet = false;
        // Script direction (defaults to ltr)
        this.ltr = true;
        this.htmlRootPath = '';
        // Content date (FIXME: Does this belong in Zim?)
        var date = new Date();
        this.contentDate = date.getFullYear() + "-" + ("0" + (date.getMonth() + 1)).slice(-2);
        // Compute dump formats
        this.dumps = [''];
        if (format) {
            if (format instanceof Array) {
                this.dumps = [];
                var self_1 = this;
                format.forEach(function (value) {
                    self_1.dumps.push(value === true ? '' : value);
                });
            }
            else if (format !== true) {
                this.dumps = [format];
            }
            if (this.dumps.indexOf('nodet') !== -1 && !this.zim.mobileLayout) {
                throw new Error('The "nodet" format can only work with --mobileLayout');
            }
        }
        // Update the other config objects
        this.mw.env = this;
        this.zim.env = this;
    }
    OfflinerEnv.prototype.computeFilenameRadical = function (withoutSelection, withoutContentSpecifier, withoutDate) {
        var radical;
        if (this.filenamePrefix) {
            radical = this.filenamePrefix;
        }
        else {
            radical = this.zim.creator.charAt(0).toLowerCase() + this.zim.creator.substr(1) + "_";
            var hostParts = url_1.default.parse(this.mw.webUrl).hostname.split('.');
            var langSuffix = this.zim.langIso2;
            // tslint:disable-next-line:prefer-for-of
            for (var i = 0; i < hostParts.length; i += 1) {
                if (hostParts[i] === this.zim.langIso3) {
                    langSuffix = hostParts[i];
                    break;
                }
            }
            radical += langSuffix;
        }
        if (!withoutSelection) {
            if (this.zim.articleList) {
                radical += "_" + path_1.default.basename(this.zim.articleList, path_1.default.extname(this.zim.articleList)).toLowerCase().replace(/ /g, this.mw.spaceDelimiter);
            }
            else {
                radical += '_all';
            }
        }
        if (!withoutContentSpecifier) {
            if (this.nopic) {
                radical += '_nopic';
            }
            else if (this.novid && !this.nodet) {
                radical += '_novid';
            }
            radical += this.nodet ? '_nodet' : '';
        }
        if (!withoutDate) {
            radical += "_" + this.contentDate;
        }
        return radical;
    };
    OfflinerEnv.prototype.computeHtmlRootPath = function () {
        var htmlRootPath;
        var zim = this.zim;
        if (this.nozim) {
            htmlRootPath = zim.outputDirectory[0] === '/' ? zim.outputDirectory : path_1.default.resolve(process.cwd(), zim.tmpDirectory) + "/";
        }
        else {
            htmlRootPath = zim.tmpDirectory[0] === '/' ? zim.tmpDirectory : path_1.default.resolve(process.cwd(), zim.tmpDirectory) + "/";
        }
        htmlRootPath += this.computeFilenameRadical() + "/";
        return htmlRootPath;
    };
    OfflinerEnv.prototype.getArticleUrl = function (articleId) {
        return this.getArticleBase(articleId, true);
    };
    OfflinerEnv.prototype.getArticlePath = function (articleId, escape) {
        return this.htmlRootPath + this.getArticleBase(articleId, escape);
    };
    OfflinerEnv.prototype.getArticleBase = function (articleId, escape) {
        var filename = articleId.replace(/\//g, this.mw.spaceDelimiter);
        /* Filesystem is not able to handle with filename > 255 bytes */
        while (Buffer.byteLength(filename, 'utf8') > 250) {
            filename = filename.substr(0, filename.length - 1);
        }
        function e(str) {
            if (typeof str === 'undefined') {
                return undefined;
            }
            return escape ? encodeURIComponent(str) : str;
        }
        return e(filename) + ".html";
    };
    OfflinerEnv.prototype.checkResume = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            for (var i = 0; i < _this.dumps.length; i += 1) {
                var dump = _this.dumps[i];
                _this.nopic = dump.toString().search('nopic') >= 0;
                _this.novid = dump.toString().search('novid') >= 0;
                _this.nozim = dump.toString().search('nozim') >= 0;
                _this.nodet = dump.toString().search('nodet') >= 0;
                _this.htmlRootPath = _this.computeHtmlRootPath();
                if (_this.resume && !_this.nozim) {
                    var zimPath = _this.zim.computeZimRootPath();
                    if (fs_1.default.existsSync(zimPath)) {
                        _this.logger.log(zimPath + " is already done, skip dumping & ZIM file generation");
                        _this.dumps.splice(i, 1);
                        i -= 1;
                    }
                }
            }
            var isError = !(_this.dumps.length > 0);
            if (isError) {
                reject();
            }
            else {
                resolve();
            }
        });
    };
    return OfflinerEnv;
}());
exports.default = OfflinerEnv;
