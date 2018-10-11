"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var async = __importStar(require("async"));
var follow_redirects_1 = require("follow-redirects");
var fs_1 = __importDefault(require("fs"));
var url_1 = __importDefault(require("url"));
var zlib_1 = __importDefault(require("zlib"));
var U = __importStar(require("./Utils.js"));
function getPort(urlObj) {
    return urlObj.port || (urlObj.protocol && urlObj.protocol.substring(0, 5) === 'https' ? 443 : 80);
}
var Downloader = /** @class */ (function () {
    function Downloader(logger, mw, uaString, reqTimeout) {
        this.loginCookie = '';
        this.logger = logger;
        this.uaString = uaString;
        this.loginCookie = '';
        this.requestTimeout = reqTimeout;
        this.webUrlPort = getPort(url_1.default.parse("" + mw.base + mw.wikiPath + "/"));
        // Optional URLs will not have an error message if they are
        // are not found.
        this.optionalUrls = new Set();
    }
    // Registers a URL as optional.  We don't necessarily expect this URL to be
    // present, so no error will be printed if fetching returns a value other
    // than 200.
    // Note that this also means that only a single attempt to download them
    // will be made if a status code other than 200 is returned.
    Downloader.prototype.registerOptionalUrl = function (url) {
        this.optionalUrls.add(url);
    };
    Downloader.prototype.getRequestOptionsFromUrl = function (url, compression) {
        var urlObj = url_1.default.parse(url);
        var headers = {
            'accept': 'text/html; charset=utf-8; profile="https://www.mediawiki.org/wiki/Specs/HTML/1.8.0"',
            'cache-control': 'public, max-stale=2678400',
            'accept-encoding': (compression ? 'gzip, deflate' : ''),
            'user-agent': this.uaString,
            'cookie': this.loginCookie,
        };
        return {
            protocol: urlObj.protocol,
            hostname: urlObj.hostname,
            port: getPort(urlObj),
            headers: headers,
            path: urlObj.path,
            method: url.indexOf('action=login') > -1 ? 'POST' : 'GET',
        };
    };
    Downloader.prototype.downloadContent = function (url, callback) {
        var _this = this;
        var retryCount = 0;
        var responseHeaders = {};
        var self = this;
        this.logger.log("Downloading " + decodeURI(url) + "...");
        async.retry(3, function (finished) {
            var request;
            var calledFinished = false;
            function callFinished(timeout, message, data) {
                if (!calledFinished) {
                    calledFinished = true;
                    if (message) {
                        console.error(message);
                        request.abort();
                    }
                    request = undefined;
                    setTimeout(finished, timeout, message, data);
                }
            }
            retryCount += 1;
            /* Analyse url */
            var options = self.getRequestOptionsFromUrl(url, true);
            /* Protocol detection */
            var protocol;
            if (options.protocol === 'http:') {
                protocol = follow_redirects_1.http;
            }
            else if (options.protocol === 'https:') {
                protocol = follow_redirects_1.https;
            }
            else {
                console.error("Unable to determine the protocol of the following url (" + options.protocol + "), switched back to " + (_this.webUrlPort === 443 ? 'https' : 'http') + ": " + url);
                if (_this.webUrlPort === 443) {
                    protocol = follow_redirects_1.https;
                    url = url.replace(options.protocol, 'https:');
                }
                else {
                    protocol = follow_redirects_1.http;
                    url = url.replace(options.protocol, 'http:');
                }
                console.error("New url is: " + url);
            }
            /* Downloading */
            options = self.getRequestOptionsFromUrl(url, true);
            try {
                request = (protocol).get(options, function (response) {
                    if (response.statusCode === 200) {
                        var chunks_1 = [];
                        response.on('data', function (chunk) {
                            chunks_1.push(chunk);
                        });
                        response.on('end', function () {
                            responseHeaders = response.headers;
                            var encoding = responseHeaders['content-encoding'];
                            if (encoding === 'gzip') {
                                zlib_1.default.gunzip(Buffer.concat(chunks_1), function (error, decoded) {
                                    callFinished(0, error, decoded && decoded.toString());
                                });
                            }
                            else if (encoding === 'deflate') {
                                zlib_1.default.inflate(Buffer.concat(chunks_1), function (error, decoded) {
                                    callFinished(0, error, decoded && decoded.toString());
                                });
                            }
                            else {
                                callFinished(0, null, Buffer.concat(chunks_1));
                            }
                        });
                        response.on('error', function (error) {
                            response.socket.emit('agentRemove');
                            response.socket.destroy();
                            callFinished(0, "Unable to download content [" + retryCount + "] " + decodeURI(url) + " (response code: " + response.statusCode + ", error: " + error + ").");
                        });
                    }
                    else {
                        response.socket.emit('agentRemove');
                        response.socket.destroy();
                        var message = "Unable to download content [" + retryCount + "] " + decodeURI(url) + " (response code: " + response.statusCode + ").";
                        // No error message for optional URLs; we don't necessarily
                        // expect them, and it confuses users who have other errors.
                        // Note that this also prevents a retry.
                        if (self.optionalUrls.has(url)) {
                            message = '';
                        }
                        callFinished(0, message);
                    }
                });
                request.on('error', function (error) {
                    callFinished(10000 * retryCount, "Unable to download content [" + retryCount + "] " + decodeURI(url) + " (request error: " + error + " ).");
                });
                request.on('socket', function (socket) {
                    if (!socket.custom) {
                        socket.custom = true;
                        socket.on('error', function () {
                            console.error('Socket timeout');
                            socket.emit('agentRemove');
                            socket.destroy();
                            if (request) {
                                request.emit('error', 'Socket timeout');
                            }
                        });
                        socket.on('timeout', function () {
                            console.error('Socket error');
                            socket.emit('agentRemove');
                            socket.end();
                            if (request) {
                                request.emit('error', 'Socket error');
                            }
                        });
                    }
                });
                request.setTimeout(self.requestTimeout * 1000 * retryCount);
                request.end();
            }
            catch (err) {
                console.warn("Skipping file [" + decodeURI(url) + "]. Failed to download:", err);
            }
        }, function (error, data) {
            if (error) {
                console.error("Absolutely unable to retrieve async. URL: " + error);
                /* Unfortunately, we can not do that because there are
                 * articles which simply will not be parsed correctly by
                 * Parsoid. For example this one
                 * http://parsoid-lb.eqiad.wikimedia.org/dewikivoyage/Via_Jutlandica/Gpx
                 * and this stops the whole dumping process */
                // process.exit( 1 );
            }
            callback(data || Buffer.alloc(0), responseHeaders);
        });
    };
    Downloader.prototype.downloadMediaFile = function (url, path, force, optQueue, callback) {
        if (!url || !path) {
            callback();
            return;
        }
        var self = this;
        fs_1.default.stat(path, function (statError) {
            if (statError && !force) {
                U.exitIfError(statError.code !== 'ENOENT' && statError, "Impossible to stat() " + path + ":");
                self.logger.log(path + " already downloaded, download will be skipped.");
                callback();
            }
            else {
                self.logger.log("Downloading " + decodeURI(url) + " at " + path + "...");
                self.downloadContent(url, function (content, responseHeaders) {
                    fs_1.default.writeFile(path, content, function (writeError) {
                        U.exitIfError(writeError, "Unable to write " + path + " (" + url + ")");
                        optQueue.push({ path: path, size: content.length });
                        callback(writeError, responseHeaders);
                    });
                });
            }
        });
    };
    return Downloader;
}());
exports.default = Downloader;
