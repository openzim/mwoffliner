"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = __importDefault(require("fs"));
var path_1 = __importDefault(require("path"));
var url_1 = __importDefault(require("url"));
var Utils = {
    isValidEmail: function (email) {
        var emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return emailRegex.test(email);
    },
    lcFirst: function (str) {
        str += '';
        var f = str.charAt(0).toLowerCase();
        return f + str.substr(1);
    },
    ucFirst: function (str) {
        str += '';
        var f = str.charAt(0).toUpperCase();
        return f + str.substr(1);
    },
    decodeURIComponent: function (uri) {
        try {
            return decodeURIComponent(uri);
        }
        catch (error) {
            console.error(error);
            return uri;
        }
    },
    touch: function (paths) {
        var currentDate = Date.now();
        paths = paths instanceof Array ? paths : [paths];
        paths.forEach(function (path) {
            fs_1.default.utimes(path, currentDate, currentDate, function () { return null; });
        });
    },
    getFullUrl: function (webUrlHost, url, baseUrl) {
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
    },
    exitIfError: function (error, msg) {
        if (error) {
            console.error(msg, error);
            process.exit(1);
        }
    },
    randomString: function (len) {
        var str = '';
        var charSet = 'abcdefghijklmnopqrstuvwxyz0123456789';
        for (var i = 0; i < len; i += 1) {
            var randomPoz = Math.floor(Math.random() * charSet.length);
            str += charSet.substring(randomPoz, randomPoz + 1);
        }
        return str;
    },
    /*
       * Move 'from'.childNodes to 'to' adding them before 'beforeNode'
       * If 'beforeNode' is null, the nodes are appended at the end.
       */
    migrateChildren: function (from, to, beforeNode) {
        if (beforeNode === undefined) {
            beforeNode = null;
        }
        while (from.firstChild) {
            to.insertBefore(from.firstChild, beforeNode);
        }
    },
};
exports.default = Utils;
function contains(arr, value) {
    return arr.some(function (v) { return v === value; });
}
exports.contains = contains;
