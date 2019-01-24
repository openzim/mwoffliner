import * as async from 'async';
import axios, { AxiosRequestConfig } from 'axios';
import logger from './Logger';

import * as imagemin from 'imagemin';
import imageminJpegtran from 'imagemin-jpegtran';
import imageminPngquant from 'imagemin-pngquant';
import imageminGifsicle from 'imagemin-gifsicle';
import { renderDesktopArticle, renderMCSArticle } from './util';
import MediaWiki from './MediaWiki';

const imageminOptions = {
  plugins: [
    imageminJpegtran(),
    imageminPngquant({ speed: 9 }),
    imageminGifsicle(),
  ],
};

class Downloader {
  public mw: MediaWiki;
  public uaString: string;
  public loginCookie: string = '';
  public requestTimeout: number;
  public mcsUrl: string;
  public parsoidUrl: string;

  constructor(mw: MediaWiki, uaString: string, reqTimeout: number) {
    this.mw = mw;
    this.uaString = uaString;
    this.requestTimeout = reqTimeout;
    this.loginCookie = '';


    // TODO: generate these
    this.mcsUrl = ''//mcsUrl;
    this.parsoidUrl = ''//parsoidUrl;
  }

  public async initLocalMcs() {
    // TODO: start Parsoid and MCS
    // Update this.mcsUrl and this.parsoidUrl
  }

  private getRequestOptionsFromUrl(url, compression): AxiosRequestConfig {
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
      timeout: this.requestTimeout,
      method: url.indexOf('action=login') > -1 ? 'POST' : 'GET',
    };
  }

  public async getArticle(articleId: string, useParsoidFallback = false) {

    const articleApiUrl = useParsoidFallback
      ? `${this.parsoidUrl}${encodeURIComponent(articleId)}`
      : `${this.mcsUrl}${encodeURIComponent(articleId)}`;

    logger.log(`Getting ${useParsoidFallback ? 'desktop' : 'mobile'} article from ${articleApiUrl}`);

    try {
      const json = await axios(articleApiUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }).then((response) => response.data);


      if (useParsoidFallback) {
        return renderDesktopArticle(json);
      } else {
        return renderMCSArticle(json);
      }

    } catch (err) {
      if (!useParsoidFallback) {
        return this.getArticle(articleId, true);
      } else {
        throw err;
      }
    }
  }

  public getJSON<T>(url: string) {
    return axios.get<T>(url, { responseType: 'json' }).then(a => a.data);
  }

  public downloadContent(url: string): Promise<{ content: Buffer, responseHeaders: any }> {
    return new Promise((resolve, reject) => {
      if (!url) {
        return reject(new Error(`Parameter [${url}] is not a valid url`));
      }
      let responseHeaders = {};
      logger.info(`Downloading [${decodeURI(url)}]`);
      async.retry(3, async (finished) => {
        try {
          const resp = await axios(this.getRequestOptionsFromUrl(url, true));
          responseHeaders = resp.headers;
          const compressed = await imagemin.buffer(resp.data, imageminOptions);

          finished(null, compressed);
        } catch (err) {
          finished(url as any, err.stack);
        }
      }, (error, data) => {
        if (error) {
          logger.error(`Absolutely unable to retrieve async. URL: ${error}`);
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
}

export default Downloader;
