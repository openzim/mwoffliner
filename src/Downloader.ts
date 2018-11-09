import * as async from 'async';
import axios from 'axios';
import fs from 'fs';
import urlParser, { UrlWithStringQuery } from 'url';
import zlib from 'zlib';
import Logger from './Logger';
import MediaWiki from './MediaWiki';
import * as U from './Utils.js';

function getPort(urlObj: UrlWithStringQuery) {
  return urlObj.port || (urlObj.protocol && urlObj.protocol.substring(0, 5) === 'https' ? 443 : 80);
}

class Downloader {
  public logger: Logger;
  public uaString: string;
  public loginCookie: string = '';
  public requestTimeout: any;
  public webUrlPort: string | number;
  public optionalUrls: Set<string>;

  constructor(logger: Logger, mw: MediaWiki, uaString: string, reqTimeout: any) {
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
  public registerOptionalUrl(url) {
    this.optionalUrls.add(url);
  }

  public getRequestOptionsFromUrl(url, compression) {
    const headers = {
      'accept': 'text/html; charset=utf-8; profile="https://www.mediawiki.org/wiki/Specs/HTML/1.8.0"',
      'cache-control': 'public, max-stale=2678400',
      'accept-encoding': (compression ? 'gzip, deflate' : ''),
      'user-agent': this.uaString,
      'cookie': this.loginCookie,
    };
    return {
      url,
      responseType: 'arraybuffer',
      method: url.indexOf('action=login') > -1 ? 'POST' : 'GET',
    };
  }

  public downloadContent(url: string, callback: (content: any, responseHeaders: any) => void) {
    // let retryCount = 0;
    let responseHeaders = {};
    const self = this;
    this.logger.log(`Downloading ${decodeURI(url)}...`);
    async.retry(3, async (finished) => {

      try {
        const resp = await axios(this.getRequestOptionsFromUrl(url, true));
        responseHeaders = resp.headers;
        finished(null, resp.data);
      } catch (err) {
        finished(url, err.stack);
      }
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
      callback(data || Buffer.alloc(0), responseHeaders);
    });
  }

  public downloadMediaFile(url, path, force, optQueue, callback) {
    if (!url || !path) {
      callback();
      return;
    }
    const self = this;
    fs.stat(path, (statError) => {
      if (statError && !force) {
        callback(statError.code !== 'ENOENT' && statError ? `Impossible to stat() ${path}:\n${path} already downloaded, download will be skipped.` : undefined);
      } else {
        self.logger.log(`Downloading ${decodeURI(url)} at ${path}...`);
        self.downloadContent(url, (content, responseHeaders) => {
          fs.writeFile(path, content, (writeError) => {
            optQueue.push({ path, size: responseHeaders['content-length'] });
            callback(writeError ? `Unable to write ${path} (${url})` : undefined, responseHeaders);
          });
        });
      }
    });
  }
}

export default Downloader;
