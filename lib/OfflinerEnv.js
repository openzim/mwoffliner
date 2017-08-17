'use strict';

var urlParser = require('url');
var pathParser = require('path');

// This is just a refactoring stub for now.
// Eventually, we want a MWOffliner object that might swallow this.
function OfflinerEnv(envObjs) {
    Object.assign(this, envObjs);
    this.mw.env = this;
    this.zim.env = this;
}

OfflinerEnv.prototype.computeFilenameRadical = function(withoutSelection, withoutContentSpecifier, withoutDate) {
    var radical;

    if (this.filenamePrefix) {
        radical = this.filenamePrefix;
    } else {
        radical = this.zim.creator.charAt(0).toLowerCase() + this.zim.creator.substr(1) + '_';
        var hostParts = urlParser.parse(this.mw.webUrl).hostname.split('.');
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
            radical += '_' + pathParser.basename(this.zim.articleList, pathParser.extname(this.zim.articleList)).toLowerCase().replace(/ /g, this.mw.spaceDelimiter);
        } else {
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

OfflinerEnv.prototype.getArticleUrl = function(articleId) {
    return this.getArticleBase(articleId, true);
};

OfflinerEnv.prototype.getArticlePath = function(articleId, escape) {
    return this.htmlRootPath + this.getArticleBase(articleId, escape);
};

OfflinerEnv.prototype.getArticleBase = function(articleId, escape) {
    var filename = articleId.replace(/\//g, this.mw.spaceDelimiter);
    var dirBase = filename.replace(/\./g, this.mw.spaceDelimiter);

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

module.exports = {
    OfflinerEnv: OfflinerEnv
};
