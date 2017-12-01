'use strict';

var async = require('async');
var urlParser = require('url');
var http = require('follow-redirects').http;
var https = require('follow-redirects').https;
var zlib = require('zlib');

// Downloader tied to a specific wiki
// TODO: Can probably be refactored to make independent of the wiki
function Downloader(logger, mw, uaString, reqTimeout) {
    this.logger = logger;
    this.mw = mw;
    this.uaString = uaString;
    this.loginCookie = '';
    this.requestTimeout = reqTimeout;
    this.webUrlPort = this.getRequestOptionsFromUrl(mw.base + mw.wikiPath + '/').port;
}

Downloader.prototype.getRequestOptionsFromUrl = function(url, compression) {
    var urlObj = urlParser.parse(url);
    var port = urlObj.port ? urlObj.port : (urlObj.protocol && urlObj.protocol.substring(0, 5) == 'https' ? 443 : 80);
    var headers = {
        'accept': 'text/html; charset=utf-8; profile="mediawiki.org/specs/html/1.2.0"',
        'cache-control': 'public, max-stale=2678400',
        'accept-encoding': (compression ? 'gzip, deflate' : ''),
        'user-agent': this.uaString,
        'cookie': this.loginCookie
    };

    return {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: port,
        headers: headers,
        path: urlObj.path,
        method: url.indexOf('action=login') > -1 ? 'POST' : 'GET'
    };
};

Downloader.prototype.downloadContent = function(url, callback, var1, var2, var3) {
    var retryCount = 0;
    var responseHeaders = {};
    var self = this;

    this.logger.log('Downloading ' + decodeURI(url) + '...');
    async.retry(
        3,
        function (finished) {
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

            retryCount++;

            /* Analyse url */
            var options = self.getRequestOptionsFromUrl(url, true);

            /* Protocol detection */
            var protocol;
            if (options.protocol == 'http:') {
                protocol = http;
            } else if (options.protocol == 'https:') {
                protocol = https;
            } else {
                console.error('Unable to determine the protocol of the following url (' + options.protocol + '), switched back to ' + (this.webUrlPort == 443 ? 'https' : 'http') + ': ' + url);
                if (this.webUrlPort == 443) {
                    protocol = https;
                    url = url.replace(options.protocol, 'https:');
                } else {
                    protocol = http;
                    url = url.replace(options.protocol, 'http:');
                }
                console.error('New url is: ' + url);
            }

            /* Downloading */
            options = self.getRequestOptionsFromUrl(url, true);
            request = (protocol).get(options, function (response) {
                if (response.statusCode == 200) {
                    var chunks = [];
                    response.on('data', function (chunk) {
                        chunks.push(chunk);
                    });
                    response.on('end', function () {
                        responseHeaders = response.headers;
                        var encoding = responseHeaders['content-encoding'];
                        if (encoding == 'gzip') {
                            zlib.gunzip(Buffer.concat(chunks), function (error, decoded) {
                                callFinished(0, error, decoded && decoded.toString());
                            });
                        } else if (encoding == 'deflate') {
                            zlib.inflate(Buffer.concat(chunks), function (error, decoded) {
                                callFinished(0, error, decoded && decoded.toString());
                            });
                        } else {
                            callFinished(0, null, Buffer.concat(chunks));
                        }
                    });
                    response.on('error', function () {
                        response.socket.emit('agentRemove');
                        response.socket.destroy();
                        callFinished(0, 'Unable to download content [' + retryCount + '] ' + decodeURI(url) + ' (response error: ' + response.statusCode + ').');
                    });
                } else {
                    response.socket.emit('agentRemove');
                    response.socket.destroy();
                    callFinished(0, 'Unable to download content [' + retryCount + '] ' + decodeURI(url) + ' (statusCode=' + response.statusCode + ').');
                }
            });
            request.on('error', function (error) {
                callFinished(10000 * retryCount, 'Unable to download content [' + retryCount + '] ' + decodeURI(url) + ' (request error: ' + error + ' ).');
            });
            request.on('socket', function (socket) {
                if (!socket.custom) {
                    socket.custom = true;
                    socket.on('error', function () {
                        console.error('Socket timeout');
                        socket.emit('agentRemove');
                        socket.destroy();
                        if (request) { request.emit('error', 'Socket timeout'); }
                    });
                    socket.on('timeout', function () {
                        console.error('Socket error');
                        socket.emit('agentRemove');
                        socket.end();
                        if (request) { request.emit('error', 'Socket error'); }
                    });
                }
            });
            request.setTimeout(self.requestTimeout * 1000 * retryCount);
            request.end();
        },
        function (error, data) {
            if (error) {
                console.error('Absolutely unable to retrieve async. URL: ' + error);

                /* Unfortunately, we can not do that because there are
                 * articles which simply will not be parsed correctly by
                 * Parsoid. For example this one
                 * http://parsoid-lb.eqiad.wikimedia.org/dewikivoyage/Via_Jutlandica/Gpx
                 * and this stops the whole dumping process */
                // process.exit( 1 );
            }
            callback(data || new Buffer(0), responseHeaders, var1, var2, var3);
        }
    );
};

module.exports = {
    Downloader: Downloader
};
