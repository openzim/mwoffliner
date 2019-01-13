"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = __importDefault(require("fs"));
var mkdirp_1 = __importDefault(require("mkdirp"));
var path_1 = __importDefault(require("path"));
var url_1 = __importDefault(require("url"));
var child_process_1 = require("child_process");
var axios_1 = __importDefault(require("axios"));
function isValidEmail(email) {
    var emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return emailRegex.test(email);
}
exports.isValidEmail = isValidEmail;
function lcFirst(str) {
    str += '';
    var f = str.charAt(0).toLowerCase();
    return f + str.substr(1);
}
exports.lcFirst = lcFirst;
function ucFirst(str) {
    str += '';
    var f = str.charAt(0).toUpperCase();
    return f + str.substr(1);
}
exports.ucFirst = ucFirst;
function _decodeURIComponent(uri) {
    try {
        return decodeURIComponent(uri);
    }
    catch (error) {
        console.warn(error);
        return uri;
    }
}
exports.decodeURIComponent = _decodeURIComponent;
function touch(paths) {
    var currentDate = Date.now();
    paths = paths instanceof Array ? paths : [paths];
    paths.forEach(function (path) {
        fs_1.default.utimes(path, currentDate, currentDate, function () { return null; });
    });
}
exports.touch = touch;
function getFullUrl(webUrlHost, url, baseUrl) {
    var urlObject = url_1.default.parse(url, false, true);
    if (!urlObject.protocol) {
        var baseUrlObject = baseUrl ? url_1.default.parse(baseUrl, false, true) : {};
        urlObject.protocol = urlObject.protocol || baseUrlObject.protocol || 'http:';
        urlObject.host = urlObject.host || baseUrlObject.host || webUrlHost;
        /* Relative path */
        if (urlObject.pathname && urlObject.pathname.indexOf('/') !== 0 && baseUrlObject.pathname) {
            urlObject.pathname = path_1.default.dirname(baseUrlObject.pathname) + "/" + urlObject.pathname;
        }
        url = url_1.default.format(urlObject);
    }
    return url;
}
exports.getFullUrl = getFullUrl;
function randomString(len) {
    var str = '';
    var charSet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (var i = 0; i < len; i += 1) {
        var randomPoz = Math.floor(Math.random() * charSet.length);
        str += charSet.substring(randomPoz, randomPoz + 1);
    }
    return str;
}
exports.randomString = randomString;
function getCreatorName(mw) {
    /*
     * Find a suitable name to use for ZIM (content) creator
     * Heuristic: Use basename of the domain unless
     * - it happens to be a wikimedia project OR
     * - some domain where the second part of the hostname is longer than the first part
     */
    var hostParts = url_1.default.parse(mw.base).hostname.split('.');
    var creator = hostParts[0];
    if (hostParts.length > 1) {
        var wmProjects = [
            'wikipedia',
            'wikisource',
            'wikibooks',
            'wikiquote',
            'wikivoyage',
            'wikiversity',
            'wikinews',
            'wiktionary',
        ];
        if (contains(wmProjects, hostParts[1]) || hostParts[0].length < hostParts[1].length) {
            creator = hostParts[1]; // Name of the wikimedia project
        }
    }
    creator = creator.charAt(0).toUpperCase() + creator.substr(1);
    return creator;
}
exports.getCreatorName = getCreatorName;
function checkDependencies(env) {
    /* Check if opt. binaries are available */
    var shouldCheckZimwriterFs = env.dumps.some(function (dump) { return !dump.toLowerCase().includes('nozim'); });
    var optBinaries = [
        'jpegoptim --version',
        'pngquant --version',
        'gifsicle --version',
        'advdef --version',
        'file --help',
        'stat --version',
        'convert --version',
        'rsvg-convert --version',
        shouldCheckZimwriterFs ? 'zimwriterfs --help' : null,
    ].filter(function (a) { return a; });
    return Promise.all(optBinaries.map(function (execCommand) {
        return new Promise(function (resolve, reject) {
            child_process_1.exec(execCommand, function (error) {
                if (error) {
                    reject(error);
                }
                else {
                    resolve();
                }
            });
        });
    }));
}
exports.checkDependencies = checkDependencies;
function doSeries(funcs) {
    return funcs.filter(function (a) { return a; }).reduce(function (p, func) {
        return p.then(func);
    }, Promise.resolve());
}
exports.doSeries = doSeries;
function mkdirPromise(path) {
    return new Promise(function (resolve, reject) {
        mkdirp_1.default(path, function (err) {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}
exports.mkdirPromise = mkdirPromise;
function writeFilePromise(path, content) {
    return new Promise(function (resolve, reject) {
        fs_1.default.writeFile(path, content, function (err) {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}
exports.writeFilePromise = writeFilePromise;
function execPromise(cmd) {
    return new Promise(function (resolve, reject) {
        child_process_1.exec(cmd, function (err, stdout) {
            if (err) {
                reject(err);
            }
            else {
                resolve(stdout);
            }
        });
    });
}
exports.execPromise = execPromise;
function contains(arr, value) {
    return arr.some(function (v) { return v === value; });
}
exports.contains = contains;
/*
 * Move 'from'.childNodes to 'to' adding them before 'beforeNode'
 * If 'beforeNode' is null, the nodes are appended at the end.
 */
function migrateChildren(from, to, beforeNode) {
    if (beforeNode === undefined) {
        beforeNode = null;
    }
    while (from.firstChild) {
        to.insertBefore(from.firstChild, beforeNode);
    }
}
exports.migrateChildren = migrateChildren;
function getStringsForLang(language, fallbackLanguage) {
    if (fallbackLanguage === void 0) { fallbackLanguage = 'en'; }
    var strings = {};
    try {
        strings = require("../translation/" + language + ".json");
    }
    catch (err) {
        console.warn("Couldn't find strings file for [" + language + "], falling back to [" + fallbackLanguage + "]");
        strings = require("../translation/" + fallbackLanguage + ".json");
    }
    return strings;
}
exports.getStringsForLang = getStringsForLang;
function makeArticleListItem(env, articleEntry) {
    return "<li><a href=\"" + env.getArticleBase(articleEntry.title, true) + "\">" + articleEntry.title.replace(/_/g, ' ') + "<a></li>\n";
}
exports.makeArticleListItem = makeArticleListItem;
function makeArticleImageTile(env, articleEntry) {
    return "<a class=\"item\" href=\"" + env.getArticleBase(articleEntry.title, true) + "\"><figure><img src=\"" + articleEntry.thumbnail + "\" /><figcaption>" + articleEntry.title.replace(/_/g, ' ') + "</figcaption></figure></a>\n";
}
exports.makeArticleImageTile = makeArticleImageTile;
function getJSON(url) {
    return axios_1.default.get(url, { responseType: 'json' }).then(function (a) { return a.data; });
}
exports.getJSON = getJSON;
