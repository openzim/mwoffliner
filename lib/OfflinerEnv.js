'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = __importDefault(require("fs"));
var url_1 = __importDefault(require("url"));
var path_1 = __importDefault(require("path"));
var Utils_1 = __importDefault(require("./Utils"));
// This is just a refactoring stub for now.
// Eventually, we want a MWOffliner object that might swallow this.
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
    this.contentDate = date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2);
    // Compute dump formats
    this.dumps = [''];
    if (format) {
        if (format instanceof Array) {
            this.dumps = [];
            var self = this;
            format.forEach(function (value) {
                self.dumps.push(value === true ? '' : value);
            });
        }
        else if (format !== true) {
            this.dumps = [format];
        }
        Utils_1.default.exitIfError(this.dumps.indexOf('nodet') !== -1 && !this.zim.mobileLayout, 'The "nodet" format can only work with --mobileLayout');
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
        radical = this.zim.creator.charAt(0).toLowerCase() + this.zim.creator.substr(1) + '_';
        var hostParts = url_1.default.parse(this.mw.webUrl).hostname.split('.');
        var langSuffix = this.zim.langIso2;
        for (var i = 0; i < hostParts.length; i++) {
            if (hostParts[i] === this.zim.langIso3) {
                langSuffix = hostParts[i];
                break;
            }
        }
        radical += langSuffix;
    }
    if (!withoutSelection) {
        if (this.zim.articleList) {
            radical += '_' + path_1.default.basename(this.zim.articleList, path_1.default.extname(this.zim.articleList)).toLowerCase().replace(/ /g, this.mw.spaceDelimiter);
        }
        else {
            radical += '_all';
        }
    }
    if (!withoutContentSpecifier) {
        radical += this.nopic ? '_nopic' : this.novid ? this.nodet ? '' : '_novid' : '';
        radical += this.nodet ? '_nodet' : '';
    }
    if (!withoutDate) {
        radical += '_' + this.contentDate;
    }
    return radical;
};
OfflinerEnv.prototype.computeHtmlRootPath = function () {
    var htmlRootPath;
    var zim = this.zim;
    if (this.nozim) {
        htmlRootPath = zim.outputDirectory[0] === '/' ? zim.outputDirectory : path_1.default.resolve(process.cwd(), zim.tmpDirectory) + '/';
    }
    else {
        htmlRootPath = zim.tmpDirectory[0] === '/' ? zim.tmpDirectory : path_1.default.resolve(process.cwd(), zim.tmpDirectory) + '/';
    }
    htmlRootPath += this.computeFilenameRadical() + '/';
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
    function e(string) {
        return (string === undefined ? undefined :
            escape ? encodeURIComponent(string) : string);
    }
    return e(filename) + '.html';
};
OfflinerEnv.prototype.checkResume = function (cb) {
    for (var i = 0; i < this.dumps.length; i++) {
        var dump = this.dumps[i];
        this.nopic = dump.toString().search('nopic') >= 0 ? true : false;
        this.novid = dump.toString().search('novid') >= 0 ? true : false;
        this.nozim = dump.toString().search('nozim') >= 0 ? true : false;
        this.nodet = dump.toString().search('nodet') >= 0 ? true : false;
        this.htmlRootPath = this.computeHtmlRootPath();
        if (this.resume && !this.nozim) {
            var zimPath = this.zim.computeZimRootPath();
            if (fs_1.default.existsSync(zimPath)) {
                this.logger.log(zimPath + ' is already done, skip dumping & ZIM file generation');
                this.dumps.splice(i, 1);
                i--;
            }
        }
    }
    cb(this.dumps.length > 0 ? false : true);
};
exports.default = OfflinerEnv;
