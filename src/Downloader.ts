import axios, { AxiosRequestConfig } from 'axios';
import logger from './Logger';

import * as urlParser from 'url';
import ServiceRunner from 'service-runner';
import * as imagemin from 'imagemin';
import imageminJpegoptim from 'imagemin-jpegoptim';
import imageminJpegtran from 'imagemin-jpegtran';
import imageminAdvPng from 'imagemin-advpng';
import imageminPngquant from 'imagemin-pngquant';
import imageminOptiPng from 'imagemin-optipng';
import imageminGifsicle from 'imagemin-gifsicle';
import { renderDesktopArticle, renderMCSArticle } from './util';
import MediaWiki from './MediaWiki';
import { Dump } from './Dump';
import * as backoff from 'backoff';

const imageminOptions = {
  plugins: [
    // imageminOptiPng(),
    imageminPngquant({ speed: 3, strip: true, dithering: 0 }),
    imageminAdvPng({ optimizationLevel: 4, iterations: 5 }),
    imageminJpegoptim({ max: 60, stripAll: true }),
    // imageminJpegtran(),
    imageminGifsicle({ optimizationLevel: 3, colors: 64 }),
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
    this.parsoidFallbackUrl = `${this.mw.apiUrl}action=visualeditor&format=json&action=parse&page=`;
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
    const domain = (urlParser.parse(this.mw.base)).host;
    const webUrlHost = urlParser.parse(this.mw.webUrl).host;
    this.mcsUrl = `http://localhost:6927/${domain}/v1/page/mobile-sections/`;
    this.parsoidFallbackUrl = `http://localhost:8000/${webUrlHost}/v3/page/pagebundle/`;
  }

  public query(query: string): KVS<any> {
    return this.getJSON(`${this.mw.apiUrl}${query}`);
  }

  public queryArticleThumbnail(articleId: string): KVS<any> {
    const url = this.mw.imageQueryUrl(articleId);
    return this.getJSON(url);
  }

  public async getArticle(articleId: string, dump: Dump, useParsoidFallback = false): Promise<{ displayTitle: string, html: string }> {
    logger.info(`Getting article [${articleId}]`);
    const articleApiUrl = useParsoidFallback
      ? `${this.parsoidFallbackUrl}${encodeURIComponent(articleId)}`
      : `${this.mcsUrl}${encodeURIComponent(articleId)}`;

    logger.log(`Getting ${useParsoidFallback ? 'desktop' : 'mobile'} article from ${articleApiUrl}`);

    try {
      // TODO: convert to downloader.getJSON
      const json = await this.getJSON<any>(articleApiUrl);

      if (useParsoidFallback) {
        return {
          displayTitle: json.parse.title || articleId,
          html: renderDesktopArticle(json),
        };
      } else {
        return {
          displayTitle: json.lead.displaytitle || articleId,
          html: renderMCSArticle(json, dump, dump.mwMetaData.langIso2),
        };
      }

    } catch (err) {
      if (!useParsoidFallback) {
        return this.getArticle(articleId, dump, true);
      } else {
        throw err;
      }
    }
  }

  public getJSON<T>(url: string) {
    logger.info(`Getting JSON from [${url}]`);
    return new Promise<T>((resolve, reject) => {
      const call = backoff.call(getJSON, url, (err: any, val: any) => {
        if (err) {
          logger.warn(`Failed to get [${url}] [${call.getNumRetries()}] times`);
          reject(err);
        } else {
          resolve(val);
        }
      });
      call.setStrategy(new backoff.ExponentialStrategy());
      call.failAfter(5);
      call.start();
    });
  }

  public downloadContent(url: string): Promise<{ content: Buffer, responseHeaders: any }> {
    if (!url) {
      throw new Error(`Parameter [${url}] is not a valid url`);
    }
    logger.info(`Downloading [${url}]`);
    return new Promise((resolve, reject) => {
      const requestOptions = this.getRequestOptionsFromUrl(url, true);
      const call = backoff.call(getContent, requestOptions, (err: any, val: any) => {
        if (err) {
          logger.warn(`Failed to get [${url}] [${call.getNumRetries()}] times`);
          reject(err);
        } else {
          resolve(val);
        }
      });
      call.setStrategy(new backoff.ExponentialStrategy());
      call.failAfter(5);
      call.start();
    });
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
}

export default Downloader;

function getJSON<T>(url: string, handler: any) {
  return axios.get<T>(url, { responseType: 'json' }).then((a) => handler(null, a.data), handler);
}

async function getContent(requestOptions: any, handler: any) {
  try {
    const resp = await axios(requestOptions);
    const responseHeaders = resp.headers;
    const compressed = await imagemin.buffer(resp.data, imageminOptions);

    const compressionWorked = compressed.length < resp.data.length;
    if (compressionWorked) {
      logger.info(`Compressed data from [${requestOptions.url}] from [${resp.data.length}] to [${compressed.length}]`);
    } else {
      logger.warn(`Failed to reduce file size after optimisation attempt [${requestOptions.url}]... Went from [${resp.data.length}] to [${compressed.length}]`);
    }

    handler(null, {
      responseHeaders,
      content: compressionWorked ? compressed : resp.data,
    });
  } catch (err) {
    handler(err);
  }
}
