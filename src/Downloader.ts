import axios, { AxiosRequestConfig } from 'axios';
import logger from './Logger';

import * as urlParser from 'url';
import ServiceRunner from 'service-runner';
import * as domino from 'domino';
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
import { articleDetailXId } from './articleDetail';

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
  public speed: number;

  private activeRequests = 0;
  private maxActiveRequests = 1;

  constructor(mw: MediaWiki, uaString: string, speed: number, reqTimeout: number) {
    this.mw = mw;
    this.uaString = uaString;
    this.speed = speed;
    this.maxActiveRequests = speed * 4;
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
          timeouts: {
            // request: 4 * 60 * 1000, // Default
            request: 8 * 60 * 1000,
          },
          limits: {
            wt2html: {
              // maxWikitextSize: 1000000, // Default
              maxWikitextSize: 1000000 * 2,
            },
          },
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

  public async getArticle(articleId: string, dump: Dump, useParsoidFallback = false): Promise<{ displayTitle: string, html: string }> {
    logger.info(`Getting article [${articleId}]`);
    const articleApiUrl = useParsoidFallback
      ? `${this.parsoidFallbackUrl}${encodeURIComponent(articleId)}`
      : `${this.mcsUrl}${encodeURIComponent(articleId)}`;

    logger.log(`Getting ${useParsoidFallback ? 'desktop' : 'mobile'} article from ${articleApiUrl}`);

    try {
      const articleDetail = await articleDetailXId.get(articleId);
      const json = await this.getJSON<any>(articleApiUrl);

      const isCategoryArticle = articleDetail.ns === 14 || (json.lead || {}).ns === 14;
      if (isCategoryArticle) {
        const res = await this.getJSON<any>(this.mw.subCategoriesApiUrl(articleId));
        const categoryMembers = res.query.categorymembers as Array<{ pageid: number, ns: number, title: string }>;
        articleDetail.subCategories = categoryMembers;
        await articleDetailXId.set(articleId, articleDetail);
      }

      if (useParsoidFallback) {
        return {
          displayTitle: articleId.replace('_', ' '),
          html: renderDesktopArticle(json, articleId),
        };
      } else {
        const doc = domino.createDocument(`<span class='mw-title'>${json.lead.displaytitle}</span>`);
        const strippedTitle = doc.getElementsByClassName('mw-title')[0].textContent;
        return {
          displayTitle: strippedTitle || articleId.replace(/_/g, ' '),
          html: renderMCSArticle(json, dump, articleId, articleDetail),
        };
      }

    } catch (err) {
      if (!useParsoidFallback) {
        logger.warn(`Failed to download mobile article [${articleId}], trying desktop article instead`, err);
        return this.getArticle(articleId, dump, true);
      } else {
        throw err;
      }
    }
  }

  public async getJSON<T>(url: string) {
    const self = this;
    await self.claimRequest();
    return new Promise<T>((resolve, reject) => {
      const call = backoff.call(this.getJSONCb, url, (err: any, val: any) => {
        self.releaseRequest();
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

  public async downloadContent(url: string): Promise<{ content: Buffer, responseHeaders: any }> {
    if (!url) {
      throw new Error(`Parameter [${url}] is not a valid url`);
    }
    const self = this;
    await self.claimRequest();
    return new Promise((resolve, reject) => {
      const requestOptions = this.getRequestOptionsFromUrl(url, true);
      const call = backoff.call(this.getContentCb, requestOptions, (err: any, val: any) => {
        self.releaseRequest();
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

  private async claimRequest(): Promise<null> {
    if (this.activeRequests < this.maxActiveRequests) {
      this.activeRequests += 1;
      return null;
    } else {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      return this.claimRequest();
    }
  }

  private async releaseRequest(): Promise<null> {
    this.activeRequests -= 1;
    return null;
  }

  private getJSONCb<T>(url: string, handler: any) {
    logger.info(`Getting JSON from [${url}]`);
    axios.get<T>(url, { responseType: 'json' })
      .then((a) => handler(null, a.data), handler)
      .catch((err) => {
        try {
          if (err.response.status === 429) {
            logger.log(`Received a [status=429], slowing down`);
            const newMaxActiveRequests = Math.max(Math.ceil(this.maxActiveRequests * 0.9), 1);
            logger.log(`Setting maxActiveRequests from [${this.maxActiveRequests}] to [${newMaxActiveRequests}]`);
            this.maxActiveRequests = newMaxActiveRequests;
            return this.getJSONCb(url, handler);
          } else {
            handler(err);
          }
        } catch (a) {
          handler(err);
        }
      });
  }

  private async getContentCb(requestOptions: any, handler: any) {
    logger.info(`Downloading [${requestOptions.url}]`);
    try {
      const resp = await axios(requestOptions);
      const responseHeaders = resp.headers;

      const shouldCompress = responseHeaders['content-type'].includes('image/');
      const compressed = shouldCompress ? await imagemin.buffer(resp.data, imageminOptions) : resp.data;

      const compressionWorked = compressed.length < resp.data.length;
      if (compressionWorked) {
        logger.info(`Compressed data from [${requestOptions.url}] from [${resp.data.length}] to [${compressed.length}]`);
      } else if (shouldCompress) {
        logger.warn(`Failed to reduce file size after optimisation attempt [${requestOptions.url}]... Went from [${resp.data.length}] to [${compressed.length}]`);
      }

      handler(null, {
        responseHeaders,
        content: compressionWorked ? compressed : resp.data,
      });
    } catch (err) {
      try {
        if (err.response.status === 429) {
          logger.log(`Received a [status=429], slowing down`);
          const newMaxActiveRequests = Math.max(Math.ceil(this.maxActiveRequests * 0.9), 1);
          logger.log(`Setting maxActiveRequests from [${this.maxActiveRequests}] to [${newMaxActiveRequests}]`);
          this.maxActiveRequests = newMaxActiveRequests;
          this.getContentCb(requestOptions, handler);
        } else {
          handler(err);
        }
      } catch (a) {
        handler(err);
      }
    }
  }

}

export default Downloader;
