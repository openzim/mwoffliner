const fs = require('fs');
const async = require('async');
const urlParser = require('url');
const { http, https } = require('follow-redirects');
const zlib = require('zlib');
const U = require('./Utils.js').Utils;

function getPort(urlObj) {
  return urlObj.port || (urlObj.protocol && urlObj.protocol.substring(0, 5) === 'https' ? 443 : 80);
}

class Downloader {
  constructor(logger, mw, uaString, reqTimeout) {
    this.logger = logger;
    this.uaString = uaString;
    this.loginCookie = '';
    this.requestTimeout = reqTimeout;
    this.webUrlPort = getPort(urlParser.parse(`${mw.base}${mw.wikiPath}/`));
    // Optional URLs will not have an error message if they are
    // are not found.
    this.optionalUrls = new Set();
  }

  // Registers a URL as optional.  We don't necessarily expect this URL to be
  // present, so no error will be printed if fetching returns a value other
  // than 200.
  // Note that this also means that only a single attempt to download them
  // will be made if a status code other than 200 is returned.
  registerOptionalUrl(url) {
    this.optionalUrls.add(url);
  }

  getRequestOptionsFromUrl(url, compression) {
    const urlObj = urlParser.parse(url);
    const headers = {
      accept: 'text/html; charset=utf-8; profile="https://www.mediawiki.org/wiki/Specs/HTML/1.8.0"',
      'cache-control': 'public, max-stale=2678400',
      'accept-encoding': (compression ? 'gzip, deflate' : ''),
      'user-agent': this.uaString,
      cookie: this.loginCookie,
    };
    return {
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: getPort(urlObj),
      headers,
      path: urlObj.path,
      method: url.indexOf('action=login') > -1 ? 'POST' : 'GET',
    };
  }

  downloadContent(url, callback, var1, var2, var3) {
    let retryCount = 0;
    let responseHeaders = {};
    const self = this;
    this.logger.log(`Downloading ${decodeURI(url)}...`);
    async.retry(3, (finished) => {
      let request;
      let calledFinished = false;
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
      let options = self.getRequestOptionsFromUrl(url, true);
      /* Protocol detection */
      let protocol;
      if (options.protocol === 'http:') {
        protocol = http;
      } else if (options.protocol === 'https:') {
        protocol = https;
      } else {
        console.error(`Unable to determine the protocol of the following url (${options.protocol}), switched back to ${this.webUrlPort === 443 ? 'https' : 'http'}: ${url}`);
        if (this.webUrlPort === 443) {
          protocol = https;
          url = url.replace(options.protocol, 'https:');
        } else {
          protocol = http;
          url = url.replace(options.protocol, 'http:');
        }
        console.error(`New url is: ${url}`);
      }
      /* Downloading */
      options = self.getRequestOptionsFromUrl(url, true);
      request = (protocol).get(options, (response) => {
        if (response.statusCode === 200) {
          const chunks = [];
          response.on('data', (chunk) => {
            chunks.push(chunk);
          });
          response.on('end', () => {
            responseHeaders = response.headers;
            const encoding = responseHeaders['content-encoding'];
            if (encoding === 'gzip') {
              zlib.gunzip(Buffer.concat(chunks), (error, decoded) => {
                callFinished(0, error, decoded && decoded.toString());
              });
            } else if (encoding === 'deflate') {
              zlib.inflate(Buffer.concat(chunks), (error, decoded) => {
                callFinished(0, error, decoded && decoded.toString());
              });
            } else {
              callFinished(0, null, Buffer.concat(chunks));
            }
          });
          response.on('error', (error) => {
            response.socket.emit('agentRemove');
            response.socket.destroy();
            callFinished(0, `Unable to download content [${retryCount}] ${decodeURI(url)} (response code: ${response.statusCode}, error: ${error}).`);
          });
        } else {
          response.socket.emit('agentRemove');
          response.socket.destroy();
          let message = `Unable to download content [${retryCount}] ${decodeURI(url)} (response code: ${response.statusCode}).`;
          // No error message for optional URLs; we don't necessarily
          // expect them, and it confuses users who have other errors.
          // Note that this also prevents a retry.
          if (self.optionalUrls.has(url)) {
            message = '';
          }
          callFinished(0, message);
        }
      });
      request.on('error', (error) => {
        callFinished(10000 * retryCount, `Unable to download content [${retryCount}] ${decodeURI(url)} (request error: ${error} ).`);
      });
      request.on('socket', (socket) => {
        if (!socket.custom) {
          socket.custom = true;
          socket.on('error', () => {
            console.error('Socket timeout');
            socket.emit('agentRemove');
            socket.destroy();
            if (request) {
              request.emit('error', 'Socket timeout');
            }
          });
          socket.on('timeout', () => {
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
    }, (error, data) => {
      if (error) {
        console.error(`Absolutely unable to retrieve async. URL: ${error}`);
        /* Unfortunately, we can not do that because there are
         * articles which simply will not be parsed correctly by
         * Parsoid. For example this one
         * http://parsoid-lb.eqiad.wikimedia.org/dewikivoyage/Via_Jutlandica/Gpx
         * and this stops the whole dumping process */
        // process.exit( 1 );
      }
      callback(data || Buffer.alloc(0), responseHeaders, var1, var2, var3);
    });
  }

  downloadMediaFile(url, path, force, optQueue, callback) {
    if (!url || !path) {
      callback();
      return;
    }
    const self = this;
    fs.stat(path, (statError) => {
      if (statError && !force) {
        U.exitIfError(statError.code !== 'ENOENT' && statError, `Impossible to stat() ${path}:`);
        self.logger.log(`${path} already downloaded, download will be skipped.`);
        callback();
      } else {
        self.logger.log(`Downloading ${decodeURI(url)} at ${path}...`);
        self.downloadContent(url, (content, responseHeaders) => {
          fs.writeFile(path, content, (writeError) => {
            U.exitIfError(writeError, `Unable to write ${path} (${url})`);
            optQueue.push({ path, size: content.length });
            callback(writeError, responseHeaders);
          });
        });
      }
    });
  }
}

export default Downloader;
