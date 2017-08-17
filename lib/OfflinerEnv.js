'use strict';

var urlParser = require('url');
var pathParser = require('path');

// This is just a refactoring stub for now.
// Eventually, we want a MWOffliner object that might swallow this.
function OfflinerEnv(envObjs) {
    Object.assign(this, envObjs);
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

module.exports = {
    OfflinerEnv: OfflinerEnv
};
