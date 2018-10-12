"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = __importDefault(require("fs"));
var path_1 = __importDefault(require("path"));
var url_1 = __importDefault(require("url"));
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
        console.error(error);
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
function contains(arr, value) {
    return arr.some(function (v) { return v === value; });
}
exports.contains = contains;
