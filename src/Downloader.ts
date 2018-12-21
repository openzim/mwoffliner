import * as async from 'async';
import axios from 'axios';
import fs from 'fs';
import urlParser, { UrlWithStringQuery } from 'url';
import Logger from './Logger';
import MediaWiki from './MediaWiki';

function getPort(urlObj: UrlWithStringQuery) {
  return urlObj.port || (urlObj.protocol && urlObj.protocol.substring(0, 5) === 'https' ? 443 : 80);
}

class Downloader {
  public logger: Logger;
  public uaString: string;
  public loginCookie: string = '';
  public requestTimeout: any;
  public webUrlPort: string | number;

  constructor(logger: Logger, mw: MediaWiki, uaString: string, reqTimeout: any) {
    this.logger = logger;
    this.uaString = uaString;
    this.loginCookie = '';
    this.requestTimeout = reqTimeout;
    this.webUrlPort = getPort(urlParser.parse(`${mw.base}${mw.wikiPath}/`));
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
      headers,
      responseType: 'arraybuffer',
      method: url.indexOf('action=login') > -1 ? 'POST' : 'GET',
    };
  }

  public downloadContent(url: string): Promise<{ content: any, responseHeaders: any }> {
    return new Promise((resolve, reject) => {
      let responseHeaders = {};
      this.logger.info(`Downloading [${decodeURI(url)}]`);
      async.retry(3, async (finished) => {
        try {
          const resp = await axios(this.getRequestOptionsFromUrl(url, true));
          responseHeaders = resp.headers;
          finished(null, resp.data);
        } catch (err) {
          finished(url as any, err.stack);
        }
      }, (error, data) => {
        if (error) {
          this.logger.error(`Absolutely unable to retrieve async. URL: ${error}`);
          reject(error);
          /* Unfortunately, we can not do that because there are
           * articles which simply will not be parsed correctly by
           * Parsoid. For example this one
           * http://parsoid-lb.eqiad.wikimedia.org/dewikivoyage/Via_Jutlandica/Gpx
           * and this stops the whole dumping process */
          // process.exit( 1 );
        } else {
          resolve({ content: data, responseHeaders });
        }
      });
    });
  }

  public async downloadMediaFile(url, path, force, optQueue) {
    return new Promise((resolve, reject) => {
      if (!url || !path) {
        resolve();
        return;
      }
      const self = this;
      fs.stat(path, async (statError) => {
        if (statError && !force) {
          reject(statError.code !== 'ENOENT' && statError ? `Impossible to stat() ${path}:\n${path} already downloaded, download will be skipped.` : undefined);
        } else {
          self.logger.info(`Downloading ${decodeURI(url)} at ${path}...`);
          try {
            const { content, responseHeaders } = await self.downloadContent(url);
            fs.writeFile(path, content, (writeError) => {
              if (writeError) {
                reject({ message: `Unable to write ${path} (${url})`, error: writeError });
              } else {
                optQueue.push({ path, size: Number(responseHeaders['content-length']) });
                resolve();
              }
            });
          } catch (err) {
            reject({ message: `Failed to get file: [${url}]`, error: err });
          }
        }
      });
    });
  }
}

export default Downloader;
