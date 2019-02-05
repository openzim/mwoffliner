import * as async from 'async';
import axios, { AxiosRequestConfig } from 'axios';
import logger from './Logger';

import * as urlParser from 'url';
import ServiceRunner from 'service-runner';
import * as imagemin from 'imagemin';
import imageminJpegtran from 'imagemin-jpegtran';
import imageminPngquant from 'imagemin-pngquant';
import imageminGifsicle from 'imagemin-gifsicle';
import { renderDesktopArticle, renderMCSArticle } from './util';
import MediaWiki from './MediaWiki';
import { Dump } from './Dump';

const imageminOptions = {
  plugins: [
    imageminJpegtran(),
    imageminPngquant({ speed: 9 }),
    imageminGifsicle(),
  ],
};

const runner = new ServiceRunner();

class Downloader {
  public mw: MediaWiki;
  public uaString: string;
  public loginCookie: string = '';
  public requestTimeout: number;
  public mcsUrl: string;
  public parsoidFallbackUrl: string;
  public speed: number; // TODO: consider moving queueing to the downloader class so the rest of the logic can forget about it

  constructor(mw: MediaWiki, uaString: string, speed: number, reqTimeout: number) {
    this.mw = mw;
    this.uaString = uaString;
    this.speed = speed;
    this.requestTimeout = reqTimeout;
    this.loginCookie = '';

    this.mcsUrl = `${this.mw.base}api/rest_v1/page/mobile-sections/`;
    this.parsoidFallbackUrl = `${this.mw.apiUrl}action=visualeditor&format=json&paction=parse&page=`;
  }

  public async initLocalMcs() {
    logger.log('Starting Parsoid & MCS');

    await runner.start({
      num_workers: 0,
      services: [{
        name: 'parsoid',
        module: 'node_modules/parsoid/lib/index.js',
        entrypoint: 'apiServiceWorker',
        conf: {
          mwApis: [{
            uri: `${this.mw.base + this.mw.apiPath}`,
          }],
        },
      }, {
        name: 'mcs',
        module: 'node_modules/service-mobileapp-node/app.js',
        conf: {
          port: 6927,
          mwapi_req: {
            method: 'post',
            uri: `https://{{domain}}/${this.mw.apiPath}`,
            headers: {
              'user-agent': '{{user-agent}}',
            },
            body: '{{ default(request.query, {}) }}',
          },
          restbase_req: {
            method: '{{request.method}}',
            uri: 'http://localhost:8000/{{domain}}/v3/{+path}',
            query: '{{ default(request.query, {}) }}',
            headers: '{{request.headers}}',
            body: '{{request.body}}',
          },
        },
      }],
      logging: {
        level: 'info',
      },
    });
    const domain = (new URL(this.mw.base)).host;
    const webUrlHost = urlParser.parse(this.mw.webUrl).host;
    this.mcsUrl = `http://localhost:6927/${domain}/v1/page/mobile-sections/`;
    this.parsoidFallbackUrl = `http://localhost:8000/${webUrlHost}/v3/page/pagebundle/`;
  }

  private getRequestOptionsFromUrl(url: string, compression: boolean): AxiosRequestConfig {
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

  public query(query: string): KVS<any> {
    return this.getJSON(`${this.mw.apiUrl}${query}`);
  }

  public queryArticleThumbnail(articleId: string): KVS<any> {
    const url = this.mw.imageQueryUrl(articleId);
    return this.getJSON(url);
  }

  public async getArticle(articleId: string, dump: Dump, langIso2: string, useParsoidFallback = false): Promise<string> {
    logger.info(`Getting article [${articleId}]`);
    const articleApiUrl = useParsoidFallback
      ? `${this.parsoidFallbackUrl}${encodeURIComponent(articleId)}`
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
        return renderMCSArticle(json, dump, langIso2);
      }

    } catch (err) {
      if (!useParsoidFallback) {
        return this.getArticle(articleId, dump, langIso2, true);
      } else {
        throw err;
      }
    }
  }

  public getJSON<T>(url: string) {
    logger.info(`Getting JSON from [${url}]`);
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
          logger.warn(`Failed to download from [${url}], retrying`, err);
          finished(url as any);
        }
      }, (error, data) => {
        if (error) {
          logger.error(`Absolutely unable to retrieve async. URL: ${error}`);
          reject(error);
        } else {
          resolve({ content: data, responseHeaders });
        }
      });
    });
  }
}

export default Downloader;
