import axios, { AxiosRequestConfig } from 'axios';
import logger from './Logger';
import domino from 'domino';

import * as urlParser from 'url';
import ServiceRunner from 'service-runner';
import * as imagemin from 'imagemin';
import imageminJpegoptim from 'imagemin-jpegoptim';
import imageminAdvPng from 'imagemin-advpng';
import imageminPngquant from 'imagemin-pngquant';
import imageminGifsicle from 'imagemin-gifsicle';
import { renderDesktopArticle, renderMCSArticle, getStrippedTitleFromHtml, readFilePromise, writeFilePromise } from './util';
import MediaWiki from './MediaWiki';
import { Dump } from './Dump';
import * as backoff from 'backoff';
import { normalizeMwResponse } from './util/mw-api';
import deepmerge from 'deepmerge';
import { requestCacheXUrl, articleDetailXId } from './stores';
import * as path from 'path';
import md5 from 'md5';

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
  public useCache: boolean;
  public cacheDirectory: string;
  public forceParsoidFallback: boolean = false;

  private activeRequests = 0;
  private maxActiveRequests = 1;

  constructor(mw: MediaWiki, uaString: string, speed: number, reqTimeout: number, useCache: boolean, cacheDirectory: string) {
    this.mw = mw;
    this.uaString = uaString;
    this.speed = speed;
    this.maxActiveRequests = speed * 10;
    this.requestTimeout = reqTimeout;
    this.loginCookie = '';
    this.useCache = useCache;
    this.cacheDirectory = cacheDirectory;

    this.mcsUrl = `${this.mw.base}api/rest_v1/page/mobile-sections/`;
    this.parsoidFallbackUrl = `${this.mw.apiUrl}action=visualeditor&mobileformat=html&format=json&paction=parse&page=`;
  }

  public async initLocalMcs(forceLocalParsoid = true) {
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
              maxWikitextSize: 1000000 * 4,
              // maxListItems: 30000, // Default
              maxListItems: 30000 * 4,
              // maxTableCells: 30000, // Default
              maxTableCells: 30000 * 4,
              // maxTransclusions: 10000, // Default
              maxTransclusions: 10000 * 4,
              // maxImages: 1000, // Default
              maxImages: 1000 * 4,
              // maxTokens: 1000000, // Default
              maxTokens: 1000000 * 4,
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
    this.mcsUrl = `http://localhost:6927/${domain}/v1/page/mobile-sections/`;
    if (forceLocalParsoid) {
      const webUrlHost = urlParser.parse(this.mw.webUrl).host;
      this.parsoidFallbackUrl = `http://localhost:8000/${webUrlHost}/v3/page/pagebundle/`;
    }
  }

  public query(query: string): KVS<any> {
    return this.getJSON(`${this.mw.apiUrl}${query}`);
  }

  public async getArticleDetailsIds(articleIds: string[], continuation?: ContinueOpts): Promise<QueryMwRet> {
    const queryOpts = {
      titles: articleIds.join('|'),
      prop: `redirects|coordinates|revisions|pageimages${this.mw.getCategories ? '|categories' : ''}`,
      action: 'query',
      format: 'json',
      rdlimit: 'max',
      colimit: 'max',
      clshow: '!hidden',
      ...(this.mw.getCategories ? { cllimit: 'max' } : {}),
      ...(continuation || {}),
    };

    const queryString = objToQueryString(queryOpts);
    const reqUrl = `${this.mw.apiUrl}${queryString}`;

    const resp = await this.getJSON<MwApiResponse>(reqUrl);
    if (resp.warnings) {
      logger.warn(`Got warning from MW Query`, JSON.stringify(resp.warnings, null, '\t'));
    }

    if (resp.error) {
      logger.error(`Got error from MW Query`, JSON.stringify(resp.error, null, '\t'));
    }

    const processedResponse = resp.query ? normalizeMwResponse(resp.query) : {};

    if (resp.continue) {

      const nextResp = await this.getArticleDetailsIds(articleIds, resp.continue);

      return deepmerge(processedResponse, nextResp);

    } else {
      if (this.mw.getCategories) {
        logger.info(`Getting subCategories`);
        for (const [articleId, articleDetail] of Object.entries(processedResponse)) {
          const isCategoryArticle = articleDetail.ns === 14;
          if (isCategoryArticle) {
            const categoryMembers = await this.getSubCategories(articleId);
            (processedResponse[articleId] as any).subCategories = categoryMembers;
          }
        }
      }
      return processedResponse;
    }
  }

  public async getArticleDetailsNS(ns: number, gapcontinue: string = '', queryContinuation?: QueryContinueOpts): Promise<{ gapContinue: string, articleDetails: QueryMwRet }> {
    const queryOpts: KVS<string> = {
      action: 'query',
      format: 'json',
      prop: `coordinates|revisions|redirects${this.mw.getCategories ? '|categories' : ''}`,
      generator: 'allpages',
      gapfilterredir: 'nonredirects',
      gaplimit: 'max',
      gapnamespace: String(ns),
      rawcontinue: 'true',
      rdlimit: 'max',
      gapcontinue,
      ...(this.mw.getCategories ? {
        cllimit: 'max',
        clshow: '!hidden',
      } : {}),
    };

    if (queryContinuation) {
      if (queryContinuation.coordinates && queryContinuation.coordinates.cocontinue) {
        queryOpts.cocontinue = queryContinuation.coordinates.cocontinue;
      }
      if (queryContinuation.categories && queryContinuation.categories.clcontinue) {
        queryOpts.clcontinue = queryContinuation.categories.clcontinue;
      }
      if (queryContinuation.pageimages && queryContinuation.pageimages.picontinue) {
        queryOpts.picontinue = queryContinuation.pageimages.picontinue;
      }
      if (queryContinuation.redirects && queryContinuation.redirects.rdcontinue) {
        queryOpts.rdcontinue = queryContinuation.redirects.rdcontinue;
      }
    }

    const queryString = objToQueryString(queryOpts);
    const reqUrl = `${this.mw.apiUrl}${queryString}`;

    const resp = await this.getJSON<MwApiResponse>(reqUrl);
    if (resp.warnings) {
      logger.warn(`Got warning from MW Query`, JSON.stringify(resp.warnings, null, '\t'));
    }

    if (resp.error) {
      logger.error(`Got error from MW Query`, JSON.stringify(resp.error, null, '\t'));
    }

    const processedResponse = resp.query ? normalizeMwResponse(resp.query) : {};

    let gCont: string = null;
    try {
      gCont = resp['query-continue'].allpages.gapcontinue;
    } catch (err) { /* NOOP */ }

    const queryComplete = Object.keys(resp['query-continue'] || {}).filter((key) => key !== 'allpages').length === 0;

    if (!queryComplete) {
      const nextResp = await this.getArticleDetailsNS(ns, gapcontinue, resp['query-continue']);

      return {
        articleDetails: deepmerge(processedResponse, nextResp.articleDetails),
        gapContinue: gCont,
      };
    } else {
      if (this.mw.getCategories) {
        logger.info(`Getting subCategories`);
        for (const [articleId, articleDetail] of Object.entries(processedResponse)) {
          const isCategoryArticle = articleDetail.ns === 14;
          if (isCategoryArticle) {
            const categoryMembers = await this.getSubCategories(articleId);
            (processedResponse[articleId] as any).subCategories = categoryMembers;
          }
        }
      }

      return {
        articleDetails: processedResponse,
        gapContinue: gCont,
      };
    }

  }

  public async getArticle(articleId: string, dump: Dump, useParsoidFallback = false): Promise<Array<{ articleId: string, displayTitle: string, html: string }>> {
    articleId = articleId.replace(/ /g, '_');
    logger.info(`Getting article [${articleId}]`);
    if (!useParsoidFallback) {
      useParsoidFallback = this.forceParsoidFallback;
    }
    const articleApiUrl = useParsoidFallback
      ? `${this.parsoidFallbackUrl}${encodeURIComponent(articleId)}`
      : `${this.mcsUrl}${encodeURIComponent(articleId)}`;

    logger.info(`Getting ${useParsoidFallback ? 'desktop' : 'mobile'} article from ${articleApiUrl}`);

    try {
      const articleDetail = await articleDetailXId.get(articleId);
      const json = await this.getJSON<any>(articleApiUrl);
      if (json.type === 'api_error') {
        this.forceParsoidFallback = true;
        console.info(`Received an "api_error", forcing all article requests to use Parsoid fallback`);
        throw new Error(`API Error when scraping [${articleApiUrl}]`);
      }

      if (useParsoidFallback) {
        const html = renderDesktopArticle(json, articleId);
        const strippedTitle = getStrippedTitleFromHtml(html);
        return [{
          articleId,
          displayTitle: strippedTitle || articleId.replace('_', ' '),
          html,
        }];
      } else {
        const articlesToReturn = [];

        // Paginate when there are more than 200 subCategories
        const numberOfPagesToSplitInto = Math.max(Math.ceil((articleDetail.subCategories || []).length / 200), 1);
        for (let i = 0; i < numberOfPagesToSplitInto; i++) {
          const pageId = i === 0 ? '' : `__${i}`;
          const _articleId = articleId + pageId;
          const _articleDetail = Object.assign(
            {},
            articleDetail,
            {
              subCategories: (articleDetail.subCategories || []).slice(i * 200, (i + 1) * 200),
              nextArticleId: numberOfPagesToSplitInto > i + 1 ? `${articleId}__${i + 1}` : null,
              prevArticleId: (i - 1) > 0 ?
                `${articleId}__${i - 1}`
                : (i - 1) === 0
                  ? articleId
                  : null,
            },
          );

          if ((articleDetail.subCategories || []).length > 200) {
            await articleDetailXId.set(_articleId, _articleDetail);
          }

          const html = renderMCSArticle(json, dump, _articleId, _articleDetail);
          let strippedTitle = getStrippedTitleFromHtml(html);
          if (!strippedTitle) {
            const title = (json.lead || { displaytitle: articleId }).displaytitle;
            const doc = domino.createDocument(`<span class='mw-title'>${title}</span>`);
            strippedTitle = doc.getElementsByClassName('mw-title')[0].textContent;
          }

          articlesToReturn.push({
            articleId: _articleId,
            displayTitle: (strippedTitle || articleId.replace(/_/g, ' ')) + (i === 0 ? '' : `/${i}`),
            html,
          });
        }

        return articlesToReturn;
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
    if (this.useCache) {
      const cachedVal = await requestCacheXUrl.get(url);
      if (cachedVal) {
        logger.info(`Cache hit for [${url}]`);
        return cachedVal;
      }
    }
    await self.claimRequest();
    return new Promise<T>((resolve, reject) => {
      const call = backoff.call(this.getJSONCb, url, (err: any, val: any) => {
        self.releaseRequest();
        if (err) {
          logger.warn(`Failed to get [${url}] [${call.getNumRetries()}] times`);
          reject(err);
        } else {
          if (self.useCache) {
            requestCacheXUrl.set(url, val);
          }
          resolve(val);
        }
      });
      call.retryIf((err: any) => err.response && err.response.status !== 404);
      call.setStrategy(new backoff.ExponentialStrategy());
      call.failAfter(5);
      call.start();
    });
  }

  public async downloadContent(url: string): Promise<{ content: Buffer, responseHeaders: any }> {
    if (!url) {
      throw new Error(`Parameter [${url}] is not a valid url`);
    }
    if (this.useCache) {
      const cacheVal = await requestCacheXUrl.get(url);
      if (cacheVal) {
        logger.info(`Cache hit for [${url}]`);
        const { filePath, responseHeaders } = cacheVal;
        const content = await readFilePromise(filePath, null) as Buffer;
        return {
          content,
          responseHeaders,
        };
      }
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
          if (self.useCache) {
            self.cacheResponse(url, val)
              .then(() => {
                resolve(val);
              })
              .catch((err) => {
                logger.warn(`Failed to cache response for [${url}]`, err);
                reject({ message: `Failed to cache response`, err });
              });
          } else {
            resolve(val);
          }
        }
      });
      call.retryIf((err: any) => err.response && err.response.status !== 404);
      call.setStrategy(new backoff.ExponentialStrategy());
      call.failAfter(5);
      call.start();
    });
  }

  private async cacheResponse(url: string, val: { content: Buffer, responseHeaders: any }) {
    const fileName = md5(url);
    const filePath = path.join(this.cacheDirectory, fileName);
    logger.info(`Caching response for [${url}] to [${filePath}]`);
    await writeFilePromise(filePath, val.content, null);
    await requestCacheXUrl.set(url, {
      filePath,
      responseHeaders: val.responseHeaders,
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
          if (err.response && err.response.status === 429) {
            logger.log(`Received a [status=429], slowing down`);
            const newMaxActiveRequests = Math.max(Math.ceil(this.maxActiveRequests * 0.9), 1);
            logger.log(`Setting maxActiveRequests from [${this.maxActiveRequests}] to [${newMaxActiveRequests}]`);
            this.maxActiveRequests = newMaxActiveRequests;
            return this.getJSONCb(url, handler);
          } else if (err.response && err.response.status === 404) {
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
        if (err.response && err.response.status === 429) {
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

  private async getSubCategories(articleId: string, continueStr: string = ''): Promise<Array<{ pageid: number, ns: number, title: string }>> {
    const { query, continue: cont } = await this.getJSON<any>(this.mw.subCategoriesApiUrl(articleId, continueStr));
    const items = query.categorymembers.filter((a: any) => a && a.title);
    if (cont && cont.cmcontinue) {
      const nextItems = await this.getSubCategories(articleId, cont.cmcontinue);
      return items.concat(nextItems);
    } else {
      return items;
    }
  }

}

export default Downloader;

function objToQueryString(obj: KVS<any>) {
  const str = [];
  for (const p in obj) {
    if (obj.hasOwnProperty(p)) {
      str.push(encodeURIComponent(p) + '=' + encodeURIComponent(obj[p]));
    }
  }
  return str.join('&');
}
