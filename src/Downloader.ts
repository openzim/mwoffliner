import md5 from 'md5';
import * as path from 'path';
import * as urlParser from 'url';
import deepmerge from 'deepmerge';
import * as backoff from 'backoff';
import * as imagemin from 'imagemin';
import ServiceRunner from 'service-runner';
import imageminAdvPng from 'imagemin-advpng';
import type { BackoffStrategy } from 'backoff';
import axios, { AxiosRequestConfig } from 'axios';
import imageminPngquant from 'imagemin-pngquant';
import imageminGifsicle from 'imagemin-gifsicle';
import imageminJpegoptim from 'imagemin-jpegoptim';
import imageminWebp from 'imagemin-webp';

import {
  normalizeMwResponse,
  objToQueryString,
  readFilePromise,
  DB_ERROR,
  WEAK_ETAG_REGEX,
  writeFilePromise,
  renderArticle,
  stripHttpFromUrl,
  isBitmapImageMimeType,
  isImageUrl,
  isWebpCandidateImageMimeType,
  shouldConvertImageFilenameToWebp,
} from './util';
import S3 from './S3';
import { Dump } from './Dump';
import logger from './Logger';
import MediaWiki from './MediaWiki';


const imageminOptions = new Map();
imageminOptions.set('default', new Map());
imageminOptions.set('webp', new Map());

imageminOptions.get('default').set('image/png', {
  plugins: [
    imageminPngquant({ speed: 3, strip: true, dithering: 0 }),
    imageminAdvPng({ optimizationLevel: 4, iterations: 5 }),
  ],
})
imageminOptions.get('default').set('image/jpeg', {
  plugins: [
    imageminJpegoptim({ max: 60, stripAll: true }),
  ],
})
imageminOptions.get('default').set('image/gif', {
  plugins: [
    imageminGifsicle({ optimizationLevel: 3, colors: 64 }),
  ],
})
imageminOptions.get('webp').set('image/png', {
  plugins: [
    imageminWebp({ quality: 50, method: 6 })
  ],
})
imageminOptions.get('webp').set('image/jpeg', {
  plugins: [
    imageminWebp({ quality: 50, method: 6 })
  ],
})

interface DownloaderOpts {
  mw: MediaWiki;
  uaString: string;
  speed: number;
  reqTimeout: number;
  noLocalParserFallback: boolean;
  forceLocalParser: boolean;
  optimisationCacheUrl: string;
  s3?: S3;
  webp: boolean;
  backoffOptions?: BackoffOptions;
}

interface BackoffOptions {
  strategy: BackoffStrategy;
  failAfter: number;
  retryIf: (error?: any) => boolean;
  backoffHandler: (number: number, delay: number, error?: any) => void;
}

export interface MWCapabilities {
  veApiAvailable: boolean;  // visualeditor API
  coordinatesAvailable: boolean;
  desktopRestApiAvailable: boolean;
  mobileRestApiAvailable: boolean;
}


class Downloader {
  public readonly mw: MediaWiki;
  public loginCookie: string = '';
  public readonly speed: number;
  public baseUrl: string;
  public baseUrlForMainPage: string;
  public cssDependenceUrls: KVS<boolean> = {};
  public readonly webp: boolean = false;

  private readonly uaString: string;
  private activeRequests = 0;
  private maxActiveRequests = 1;
  private readonly requestTimeout: number;
  private readonly noLocalParserFallback: boolean = false;
  private readonly forceLocalParser: boolean = false;
  private readonly urlPartCache: KVS<string> = {};
  private readonly backoffOptions: BackoffOptions;
  private readonly optimisationCacheUrl: string;
  private s3: S3;
  private mwCapabilities: MWCapabilities; // todo move to MW
  public arrayBufferRequestOptions: AxiosRequestConfig;
  private jsonRequestOptions: AxiosRequestConfig;
  public streamRequestOptions: AxiosRequestConfig;


  constructor({ mw, uaString, speed, reqTimeout, noLocalParserFallback, forceLocalParser: forceLocalParser, optimisationCacheUrl, s3, webp, backoffOptions }: DownloaderOpts) {
    this.mw = mw;
    this.uaString = uaString;
    this.speed = speed;
    this.maxActiveRequests = speed * 10;
    this.requestTimeout = reqTimeout;
    this.loginCookie = '';
    this.noLocalParserFallback = noLocalParserFallback;
    this.forceLocalParser = forceLocalParser;
    this.optimisationCacheUrl = optimisationCacheUrl;
    this.webp = webp;
    this.s3 = s3;
    this.mwCapabilities = {
      veApiAvailable: false,
      coordinatesAvailable: true,
      desktopRestApiAvailable: false,
      mobileRestApiAvailable: false
    };

    this.backoffOptions = {
      strategy: new backoff.ExponentialStrategy(),
      failAfter: 7,
      retryIf: (err: any) => err.code === 'ECONNABORTED' || ![400, 403, 404].includes(err.response?.status),
      backoffHandler: (number: number, delay: number) => {
        logger.info(`[backoff] #${number} after ${delay} ms`);
      },
      ...backoffOptions,
    };

    this.arrayBufferRequestOptions = {
      headers: {
        'accept': 'text/html; charset=utf-8; profile="https://www.mediawiki.org/wiki/Specs/HTML/1.8.0"',
        'cache-control': 'public, max-stale=86400',
        'user-agent': this.uaString,
        'cookie': this.loginCookie,
      },
      responseType: 'arraybuffer',
      timeout: this.requestTimeout,
      method: 'GET',
      validateStatus(status) { return (status >= 200 && status < 300) || status === 304; }
    };

    this.jsonRequestOptions = {
      headers: {
        'accept': 'application/json',
        'cache-control': 'public, max-stale=86400',
        'accept-encoding': 'gzip, deflate',
        'user-agent': this.uaString,
        'cookie': this.loginCookie,
      },
      responseType: 'json',
      timeout: this.requestTimeout,
      method: 'GET'
    };

    this.streamRequestOptions = {
      headers: {
        'accept': 'application/octet-stream',
        'cache-control': 'public, max-stale=86400',
        'accept-encoding': 'gzip, deflate',
        'user-agent': this.uaString,
        'cookie': this.loginCookie,
      },
      responseType: 'stream',
      timeout: this.requestTimeout,
      method: 'GET'
    };
  }

  public serializeUrl(url: string): string {
    const { path } = urlParser.parse(url);
    const cacheablePart = url.replace(path, '');
    const cacheEntry = Object.entries(this.urlPartCache).find(([cacheId, value]) => value === cacheablePart);
    let cacheKey;
    if (!cacheEntry) {
      const cacheId = String(Object.keys(this.urlPartCache).length + 1);
      this.urlPartCache[cacheId] = cacheablePart;
      cacheKey = `_${cacheId}_`;
    } else {
      cacheKey = `_${cacheEntry[0]}_`;
    }
    return `${cacheKey}${path}`;
  }

  public deserializeUrl(url: string): string {
    if (!url.startsWith('_')) return url;
    const [, cacheId, ...pathParts] = url.split('_');
    const path = pathParts.join('_');
    const cachedPart = this.urlPartCache[cacheId];
    return `${cachedPart}${path}`;
  }

  public async setBaseUrls() {
    this.baseUrl = this.mwCapabilities.mobileRestApiAvailable ? this.mw.mobileRestApiUrl.href :
                   this.mwCapabilities.desktopRestApiAvailable ? this.mw.desktopRestApiUrl.href :
                   this.mwCapabilities.veApiAvailable ? this.mw.veApiUrl.href :
                   !this.noLocalParserFallback ? `http://localhost:6927/${this.mw.webUrl.hostname}/v1/page/mobile-sections/` :
                   undefined;

    this.baseUrlForMainPage = this.mwCapabilities.desktopRestApiAvailable ? this.mw.desktopRestApiUrl.href :
                              this.mwCapabilities.veApiAvailable ? this.mw.veApiUrl.href :
                              !this.noLocalParserFallback ? `http://localhost:8000/${this.mw.webUrl.hostname}/v3/page/pagebundle/` :
                              undefined;

    logger.log('Base Url: ', this.baseUrl);
    logger.log('Base Url for Main Page: ', this.baseUrlForMainPage);

    if (!this.baseUrl || !this.baseUrlForMainPage)
      throw new Error(`Unable to find appropriate API end-point to retrieve article HTML`);

    // TODO: This should not really be there, and not like this
    if (RegExp('.*http\:\/\/localhost.*').test(this.baseUrl + this.baseUrlForMainPage))
      await this.initLocalServices();
  }

  public async checkApiAvailabilty(url: string): Promise<boolean>{
    try {
      const resp = await axios.get(url);
      return resp.status === 200 && !resp.headers['mediawiki-api-error'];
    } catch (err) {
      logger.warn(err);
      return false;
    }
  }

  public async checkCapabilities(): Promise<void> {

    // By default check all API's responses and set the capabilities
    // accordingly. We need to set a default page (always there because
    // installed per default) to request the REST API, otherwise it would
    // fail the check.
    this.mwCapabilities.mobileRestApiAvailable = await this.checkApiAvailabilty(this.mw.mobileRestApiUrl.href + 'MediaWiki:Sidebar');
    this.mwCapabilities.desktopRestApiAvailable = await this.checkApiAvailabilty(this.mw.desktopRestApiUrl.href + 'MediaWiki:Sidebar');
    this.mwCapabilities.veApiAvailable = await this.checkApiAvailabilty(this.mw.veApiUrl.href);

    // Coordinate fetching
    const reqOpts = objToQueryString({
      ...this.getArticleQueryOpts(),
    });
    const resp = await this.getJSON<MwApiResponse>(`${this.mw.apiUrl.href}${reqOpts}`);
    const isCoordinateWarning = resp.warnings && resp.warnings.query && (resp.warnings.query['*'] || '').includes('coordinates');
    if (isCoordinateWarning) {
      logger.info(`Coordinates not available on this wiki`);
      this.mwCapabilities.coordinatesAvailable = false;
    }
  }

  public removeEtagWeakPrefix(etag: string): string {
    return etag && etag.replace(WEAK_ETAG_REGEX, '');
  }

  public async initLocalServices(): Promise<void> {
    logger.log('Starting Parsoid & MCS');

    const runner = new ServiceRunner();

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
            uri: this.mw.apiUrl.href,
          }],
        },
      }, {
        name: 'mcs',
        module: 'node_modules/service-mobileapp-node/app.js',
        conf: {
          port: 6927,
          mwapi_req: {
            method: 'post',
            uri: `https://{{domain}}${this.mw.apiUrl.pathname}`,
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
  }

  public query(query: string): KVS<any> {
    return this.getJSON(`${this.mw.apiUrl.href}${query}`);
  }

  public async getArticleDetailsIds(articleIds: string[], shouldGetThumbnail = false): Promise<QueryMwRet> {
    let continuation: ContinueOpts;
    let finalProcessedResp: QueryMwRet;

    while (true) {
      const queryOpts = {
        ...this.getArticleQueryOpts(shouldGetThumbnail, true),
        titles: articleIds.join('|'),
        ...(this.mwCapabilities.coordinatesAvailable ? { colimit: 'max' } : {}),
        ...(this.mw.getCategories ? {
          cllimit: 'max',
          clshow: '!hidden',
        } : {}),
        ...(continuation || {}),
      };
      const queryString = objToQueryString(queryOpts);
      const reqUrl = `${this.mw.apiUrl.href}${queryString}`;
      const resp = await this.getJSON<MwApiResponse>(reqUrl);
      Downloader.handleMWWarningsAndErrors(resp);

      let processedResponse = resp.query ? normalizeMwResponse(resp.query) : {};
      if (resp.continue) {
        continuation = resp.continue;
        const relevantDetails = this.stripNonContinuedProps(processedResponse);

        finalProcessedResp = finalProcessedResp === undefined ? relevantDetails :
          deepmerge(finalProcessedResp, relevantDetails);
      } else {
        if (this.mw.getCategories) {
          processedResponse = await this.setArticleSubCategories(processedResponse);
        }
        finalProcessedResp = finalProcessedResp === undefined ? processedResponse
          : deepmerge(finalProcessedResp, processedResponse);
        break;
      }
    }

    return finalProcessedResp;
  }

  public async getArticleDetailsNS(ns: number, gapcontinue: string = ''): Promise<{ gapContinue: string, articleDetails: QueryMwRet }> {
    let queryContinuation: QueryContinueOpts;
    let finalProcessedResp: QueryMwRet;
    let gCont: string = null;
    while (true) {
      const queryOpts: KVS<any> = {
        ...this.getArticleQueryOpts(),
        ...(this.mwCapabilities.coordinatesAvailable ? { colimit: 'max' } : {}),
        ...(this.mw.getCategories ? {
          cllimit: 'max',
          clshow: '!hidden',
        } : {}),
        rawcontinue: 'true',
        generator: 'allpages',
        gapfilterredir: 'nonredirects',
        gaplimit: 'max',
        gapnamespace: String(ns),
        gapcontinue,
      };

      if (queryContinuation) {
        queryOpts.cocontinue = queryContinuation?.coordinates?.cocontinue ?? queryOpts.cocontinue;
        queryOpts.clcontinue = queryContinuation?.categories?.clcontinue ?? queryOpts.clcontinue;
        queryOpts.picontinue = queryContinuation?.pageimages?.picontinue ?? queryOpts.picontinue;
        queryOpts.rdcontinue = queryContinuation?.redirects?.rdcontinue ?? queryOpts.rdcontinue;
      }

      const queryString = objToQueryString(queryOpts);
      const reqUrl = `${this.mw.apiUrl.href}${queryString}`;

      const resp = await this.getJSON<MwApiResponse>(reqUrl);
      Downloader.handleMWWarningsAndErrors(resp);

      let processedResponse = normalizeMwResponse(resp.query);

      gCont = resp['query-continue']?.allpages?.gapcontinue ?? gCont;

      const queryComplete = Object.keys(resp['query-continue'] || {})
        .filter((key) => key !== 'allpages')
        .length === 0;

      if (!queryComplete) {
        queryContinuation = resp['query-continue'];

        const relevantDetails = this.stripNonContinuedProps(processedResponse);

        finalProcessedResp = finalProcessedResp === undefined ? relevantDetails :
          deepmerge(finalProcessedResp, relevantDetails);
      } else {
        if (this.mw.getCategories) {
          processedResponse = await this.setArticleSubCategories(processedResponse);
        }

        finalProcessedResp = finalProcessedResp === undefined ? processedResponse
          : deepmerge(finalProcessedResp, processedResponse);
        break;
      }
    }

    return {
      articleDetails: finalProcessedResp,
      gapContinue: gCont,
    };
  }

  public async getArticle(articleId: string, dump: Dump): Promise<RenderedArticle[]> {
    const isMainPage = dump.isMainPage(articleId);
    const articleApiUrl = this.getArticleUrl(articleId, isMainPage);

    logger.info(`Getting article [${articleId}] from ${articleApiUrl}`);

    const json = await this.getJSON<any>(articleApiUrl);
    return await renderArticle(json, articleId, dump, this.mwCapabilities);
  }

  public async getJSON<T>(_url: string): Promise<T> {
    const self = this;
    const url = this.deserializeUrl(_url);
    await self.claimRequest();
    return new Promise<T>((resolve, reject) => {
      this.backoffCall(this.getJSONCb, url, (err: any, val: any) => {
        self.releaseRequest();
        if (err) {
          const httpStatus = err.response && err.response.status;
          logger.warn(`Failed to get [${url}] [status=${httpStatus}]`);
          reject(err);
        } else {
          resolve(val);
        }
      });
    });
  }

  public async downloadContent(_url: string): Promise<{ content: Buffer | string, responseHeaders: any }> {
    if (!_url) {
      throw new Error(`Parameter [${_url}] is not a valid url`);
    }
    const url = this.deserializeUrl(_url);

    const self = this;
    await self.claimRequest();
    return new Promise((resolve, reject) => {
      this.backoffCall(this.getContentCb, url, async (err: any, val: any) => {
        self.releaseRequest();
        if (err) {
          const httpStatus = err.response && err.response.status;
          logger.warn(`Failed to get [${url}] [status=${httpStatus}]`);
          reject(err);
        } else {
          resolve(val);
        }
      });
    });
  }

  public async canGetUrl(url: string): Promise<boolean> {
    try {
      await axios.get(url);
      return true;
    } catch (err) {
      return false;
    }
  }

  private getArticleUrl(articleId: string, isMainPage: boolean): string {
    return `${ isMainPage ? this.baseUrlForMainPage: this.baseUrl }${encodeURIComponent(articleId)}`;
  }

  private stripNonContinuedProps(articleDetails: QueryMwRet, cont: QueryContinueOpts | ContinueOpts = {}): QueryMwRet {
    const propsMap: KVS<string[]> = {
      pageimages: ['thumbnail', 'pageimage'],
      redirects: ['redirects'],
      coordinates: ['coordinates'],
      categories: ['categories'],
    };
    const keysToKeep: string[] = ['subCategories', 'revisions']
      .concat(
        Object.keys(cont).reduce((acc, key) => acc.concat(propsMap[key] || []), []),
      );
    const items = Object.entries(articleDetails)
      .map(([aId, detail]) => {
        const newDetail = keysToKeep
          .reduce((acc, key) => {
            const val = (detail as any)[key];
            if (!val) {
              return acc;
            } else {
              return {
                ...acc,
                [key]: val,
              };
            }
          }, {});
        return [
          aId,
          newDetail,
        ];
      });
    return items.reduce((acc, [key, detail]: any[]) => {
      return { ...acc, [key]: detail };
    }, {});
  }

  private static handleMWWarningsAndErrors(resp: MwApiResponse): void {
    if (resp.warnings) logger.warn(`Got warning from MW Query ${JSON.stringify(resp.warnings, null, '\t')}`);
    if (resp.error?.code === DB_ERROR) throw new Error(`Got error from MW Query ${JSON.stringify(resp.error, null, '\t')}`);
    if (resp.error) logger.log(`Got error from MW Query ${JSON.stringify(resp.warnings, null, '\t')}`);
  }

  private getArticleQueryOpts(includePageimages = false, redirects = false) {
    const validNamespaceIds = this.mw.namespacesToMirror.map((ns) => this.mw.namespaces[ns].num);
    return {
      action: 'query',
      format: 'json',
      prop: `redirects|revisions${includePageimages ? '|pageimages' : ''}${this.mwCapabilities.coordinatesAvailable ? '|coordinates' : ''}${this.mw.getCategories ? '|categories' : ''}`,
      rdlimit: 'max',
      rdnamespace: validNamespaceIds.join('|'),
      redirects: (redirects? true : undefined),
    };
  }

  private async setArticleSubCategories(articleDetails: QueryMwRet) {
    logger.info(`Getting subCategories`);
    for (const [articleId, articleDetail] of Object.entries(articleDetails)) {
      const isCategoryArticle = articleDetail.ns === 14;
      if (isCategoryArticle) {
        const categoryMembers = await this.getSubCategories(articleId);
        (articleDetails[articleId] as any).subCategories = categoryMembers.slice();
      }
    }
    return articleDetails;
  }

  private async claimRequest(): Promise<null> {
    if (this.activeRequests < this.maxActiveRequests) {
      this.activeRequests += 1;
      return null;
    } else {
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
      return this.claimRequest();
    }
  }

  private async releaseRequest(): Promise<null> {
    this.activeRequests -= 1;
    return null;
  }

  private getJSONCb = <T>( url: string, handler: (...args: any[]) => any): void => {
    logger.info(`Getting JSON from [${url}]`);
    axios.get<T>(url, this.jsonRequestOptions)
      .then((a) => handler(null, a.data), handler)
      .catch((err) => {
        try {
          if (err.response && err.response.status === 429) {
            logger.log(`Received a [status=429], slowing down`);
            const newMaxActiveRequests = Math.max(Math.ceil(this.maxActiveRequests * 0.9), 1);
            logger.log(`Setting maxActiveRequests from [${this.maxActiveRequests}] to [${newMaxActiveRequests}]`);
            this.maxActiveRequests = newMaxActiveRequests;
            return this.getJSONCb(url , handler);
          } else if (err.response && err.response.status === 404) {
            handler(err);
          }
        } catch (a) {
          logger.log('ERR', err)
          handler(err);
        }
      });
  }

  private async getCompressedBody(resp: any): Promise<any> {
    if (isBitmapImageMimeType(resp.headers['content-type'])) {
      if (isWebpCandidateImageMimeType(this.webp, resp.headers['content-type']) &&
          !this.cssDependenceUrls.hasOwnProperty(resp.config.url)) {
        resp.data = await imagemin.buffer(resp.data, imageminOptions.get('webp').get(resp.headers['content-type']));
        resp.headers.path_postfix = '.webp';
        resp.headers['content-type'] = 'image/webp';
      } else {
        resp.data = await imagemin.buffer(resp.data, imageminOptions.get('default').get(resp.headers['content-type']));
      }
      return true;
    }
    return false;
  }

  private getContentCb = async (url: string, handler: any): Promise<void> => {
    logger.info(`Downloading [${url}]`);
    try {
      if (this.optimisationCacheUrl && isImageUrl(url)) {
        this.downloadImage(url, handler);
      } else {
        const resp = await axios(url, this.arrayBufferRequestOptions);
        await this.getCompressedBody(resp);
        handler(null, {
          responseHeaders: resp.headers,
          content: resp.data,
        });
      }
    } catch (err) {
      try {
        this.errHandler(err, url, handler);
      } catch (a) {
        handler(err);
      }
    }
  }

  private async downloadImage(url: string, handler: any) {
    try {
      this.s3.downloadBlob(stripHttpFromUrl(url), this.webp ? 'webp' : '1').then(async (s3Resp) => {
        if (s3Resp?.Metadata?.etag) {
          this.arrayBufferRequestOptions.headers['If-None-Match']
            = this.removeEtagWeakPrefix(s3Resp.Metadata.etag);
        }
        const mwResp = await axios(url, this.arrayBufferRequestOptions);

        // Most of the images after uploading once will always have
        // 304 status, until modified. We need to have
        // shouldConvertImageFilenameToWebp() as fallback check because
        // of https://phabricator.wikimedia.org/T265006
        if (mwResp.status === 304) {
          const headers = (({ Body, ...o }) => o)(s3Resp);
          if (mwResp.headers['content-type'] ?
              isWebpCandidateImageMimeType(this.webp, mwResp.headers['content-type']) :
              shouldConvertImageFilenameToWebp(mwResp.config.url, this.webp) &&
              !this.cssDependenceUrls.hasOwnProperty(mwResp.config.url)) {
            headers.path_postfix = '.webp';
            headers['content-type'] = 'image/webp';
          }
          handler(null, {
            responseHeaders: headers,
            content: s3Resp.Body,
          });
          return;
        }

        // Compress content
        await this.getCompressedBody(mwResp);

        // Check for the etag and upload
        const etag = this.removeEtagWeakPrefix(mwResp.headers.etag);
        if (etag) {
          this.s3.uploadBlob(stripHttpFromUrl(url), mwResp.data, etag, this.webp ? 'webp' : '1');
        }

        handler(null, {
          responseHeaders: mwResp.headers,
          content: mwResp.data,
        });
      }).catch((err) => {
        this.errHandler(err, url, handler);
      });
    } catch (err) {
      this.errHandler(err, url, handler);
    }
  }

  private errHandler(err: any, url: string, handler: any): void {
    if (err.response && err.response.status === 429) {
      logger.log(`Received a [status=429], slowing down`);
      const newMaxActiveRequests = Math.max(Math.ceil(this.maxActiveRequests * 0.9), 1);
      logger.log(`Setting maxActiveRequests from [${this.maxActiveRequests}] to [${newMaxActiveRequests}]`);
      this.maxActiveRequests = newMaxActiveRequests;
    }
    logger.log(`Not able to download content for ${url} due to ${err}`);
    handler(err);
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

  private backoffCall(handler: (...args: any[]) => void, url: string, callback: (...args: any[]) => void | Promise<void>): void {
    const call = backoff.call(handler, url, callback);
    call.setStrategy(this.backoffOptions.strategy);
    call.retryIf(this.backoffOptions.retryIf);
    call.failAfter(this.backoffOptions.failAfter);
    call.on('backoff', this.backoffOptions.backoffHandler);
    call.start();
  }
}

export default Downloader;
