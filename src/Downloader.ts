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
import { articleDetailXId } from './stores';
import * as path from 'path';
import md5 from 'md5';
import S3 from './S3';
import { URL_IMAGE_REGEX, MIME_IMAGE_REGEX, FIND_HTTP_REGEX } from './util/const';

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

interface DownloaderOpts {
  mw: MediaWiki;
  uaString: string;
  speed: number;
  reqTimeout: number;
  useDownloadCache: boolean;
  downloadCacheDirectory?: string;
  noLocalParserFallback: boolean;
  optimisationCacheUrl: string;
  s3?: S3;
}

class Downloader {
  public mw: MediaWiki;
  public uaString: string;
  public loginCookie: string = '';
  public requestTimeout: number;
  public mcsUrl: string;
  public parsoidFallbackUrl: string;
  public speed: number;
  public useDownloadCache: boolean;
  public downloadCacheDirectory?: string;
  public forceParsoidFallback: boolean = false;
  public optimisationCacheUrl: string;
  public s3: S3;

  private canFetchCoordinates = true;
  private activeRequests = 0;
  private maxActiveRequests = 1;
  private noLocalParserFallback = false;
  private urlPartCache: KVS<string> = {};

  constructor({ mw, uaString, speed, reqTimeout, useDownloadCache, downloadCacheDirectory, noLocalParserFallback, optimisationCacheUrl, s3 }: DownloaderOpts) {
    this.mw = mw;
    this.uaString = uaString;
    this.speed = speed;
    this.maxActiveRequests = speed * 10;
    this.requestTimeout = reqTimeout;
    this.loginCookie = '';
    this.useDownloadCache = useDownloadCache;
    this.downloadCacheDirectory = downloadCacheDirectory;
    this.noLocalParserFallback = noLocalParserFallback;
    this.optimisationCacheUrl = optimisationCacheUrl;
    this.s3 = s3;

    this.mcsUrl = `${this.mw.base}api/rest_v1/page/mobile-sections/`;
    this.parsoidFallbackUrl = `${this.mw.apiUrl}action=visualeditor&mobileformat=html&format=json&paction=parse&page=`;
  }

  public serialiseUrl(url: string) {
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
    const shrunkUrl = `${cacheKey}${path}`;
    return shrunkUrl;
  }

  public deserialiseUrl(url: string) {
    if (url.startsWith('_')) {
      const [, cacheId, ...pathParts] = url.split('_');
      const path = pathParts.join('_');
      const cachedPart = this.urlPartCache[cacheId];
      return `${cachedPart}${path}`;
    } else {
      return url;
    }
  }

  public async checkCapabilities() {
    let useLocalMCS = true;
    let useLocalParsoid = true;

    let mwMetaData;
    try {
      mwMetaData = await this.mw.getMwMetaData(this);
    } catch (err) {
      logger.error(`FATAL - Failed to get MediaWiki Metadata`);
      throw err;
    }

    try {
      const MCSMainPageQuery = await this.getJSON<any>(`${this.mcsUrl}${encodeURIComponent(mwMetaData.mainPage)}`);
      useLocalMCS = !MCSMainPageQuery.lead;
    } catch (err) {
      logger.warn(`Failed to get remote MCS`);
    }

    try {
      const ParsoidMainPageQuery = await this.getJSON<any>(`${this.parsoidFallbackUrl}${encodeURIComponent(mwMetaData.mainPage)}`);
      useLocalParsoid = !ParsoidMainPageQuery.visualeditor.content;
    } catch (err) {
      logger.warn(`Failed to get remote Parsoid`);
    }

    if (!this.noLocalParserFallback) {
      if (useLocalMCS || useLocalParsoid) {
        logger.log(`Using a local MCS/Parsoid instance, couldn't find a remote one`);
        await this.initLocalMcs(useLocalParsoid);
      }
    } else if (this.noLocalParserFallback && useLocalMCS) {
      // No remote MCS available, so don't even try
      this.forceParsoidFallback = true;
      logger.log(`Using remote Parsoid only`);
    } else {
      logger.log(`Using a remote MCS/Parsoid instance`);
    }

    // Coordinate fetching
    const reqOpts = objToQueryString({
      ...this.getArticleQueryOpts(),
    });
    const resp = await this.getJSON<MwApiResponse>(`${this.mw.apiUrl}${reqOpts}`);
    const isCoordinateWarning = resp.warnings && resp.warnings.query && (resp.warnings.query['*'] || '').includes('coordinates');
    if (isCoordinateWarning) {
      logger.info(`Coordinates not available on this wiki`);
      this.canFetchCoordinates = false;
    }
  }

  public isImageUrl (url: string): boolean {
    return URL_IMAGE_REGEX.exec(url) ? true : false;
  }

  public isMimeTypeImage (mimetype: string): boolean {
    return MIME_IMAGE_REGEX.exec(mimetype) ? true : false;
  }

  public stripHttpFromUrl (url: string) {
    return url.replace(FIND_HTTP_REGEX, '');
  }

  public async initLocalMcs(forceLocalParsoid = true) {
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
    return runner;
  }

  public query(query: string): KVS<any> {
    return this.getJSON(`${this.mw.apiUrl}${query}`);
  }

  public async getArticleDetailsIds(articleIds: string[], continuation?: ContinueOpts, shouldGetThumbnail = false): Promise<QueryMwRet> {
    const queryOpts = {
      ...this.getArticleQueryOpts(shouldGetThumbnail),
      titles: articleIds.join('|'),
      ...(this.canFetchCoordinates ? { colimit: 'max' } : {}),
      ...(this.mw.getCategories ? {
        cllimit: 'max',
        clshow: '!hidden',
      } : {}),
      ...(continuation || {}),
    };

    const queryString = objToQueryString(queryOpts);
    const reqUrl = `${this.mw.apiUrl}${queryString}`;

    const resp = await this.getJSON<MwApiResponse>(reqUrl);
    this.handleMWWarningsAndErrors(resp);

    let processedResponse = resp.query ? normalizeMwResponse(resp.query) : {};

    if (resp.continue) {

      const nextResp = await this.getArticleDetailsIds(articleIds, resp.continue);

      const relevantDetails = this.stripNonContinuedProps(nextResp, continuation);

      return deepmerge(processedResponse, relevantDetails);

    } else {
      if (this.mw.getCategories) {
        processedResponse = await this.setArticleSubCategories(processedResponse);
      }
      return processedResponse;
    }
  }

  public async getArticleDetailsNS(ns: number, gapcontinue: string = '', queryContinuation?: QueryContinueOpts): Promise<{ gapContinue: string, articleDetails: QueryMwRet }> {
    const queryOpts: KVS<any> = {
      ...this.getArticleQueryOpts(),
      ...(this.canFetchCoordinates ? { colimit: 'max' } : {}),
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
    this.handleMWWarningsAndErrors(resp);

    let processedResponse = resp.query ? normalizeMwResponse(resp.query) : {};

    let gCont: string = null;
    try {
      gCont = resp['query-continue'].allpages.gapcontinue;
    } catch (err) { /* NOOP */ }

    const queryComplete = Object.keys(resp['query-continue'] || {}).filter((key) => {
      return !(
        key === 'allpages'
      );
    }).length === 0;

    if (!queryComplete) {
      const nextResp = await this.getArticleDetailsNS(ns, gapcontinue, resp['query-continue']);
      const relevantDetails = this.stripNonContinuedProps(nextResp.articleDetails, queryContinuation);
      return {
        articleDetails: deepmerge(processedResponse, relevantDetails),
        gapContinue: gCont,
      };
    } else {
      if (this.mw.getCategories) {
        processedResponse = await this.setArticleSubCategories(processedResponse);
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
        logger.error(`Received an "api_error", forcing all article requests to use Parsoid fallback`);
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
        const errMsg = err.response ? JSON.stringify(err.response.data, null, '\t') : err;
        logger.warn(`Failed to download mobile article [${articleId}], trying desktop article instead`, errMsg);
        return this.getArticle(articleId, dump, true);
      } else {
        throw err;
      }
    }
  }

  public async getJSON<T>(_url: string) {
    const self = this;
    const url = this.deserialiseUrl(_url);
    await self.claimRequest();
    return new Promise<T>((resolve, reject) => {
      const call = backoff.call(this.getJSONCb, url, (err: any, val: any) => {
        self.releaseRequest();
        if (err) {
          const httpStatus = err.response && err.response.status;
          logger.warn(`Failed to get [${url}] [${call.getNumRetries()}] times [status=${httpStatus}]`);
          reject(err);
        } else {
          resolve(val);
        }
      });
      call.retryIf((err: any) => err.response && err.response.status !== 404);
      call.setStrategy(new backoff.ExponentialStrategy());
      call.failAfter(5);
      call.start();
    });
  }

  public async downloadContent(_url: string): Promise<{ content: Buffer | string, responseHeaders: any }> {
    if (!_url) {
      throw new Error(`Parameter [${_url}] is not a valid url`);
    }
    const url = this.deserialiseUrl(_url);
    if (this.useDownloadCache) {
      try {
        const downloadCacheVal = await this.readFromDownloadCache(url);
        if (downloadCacheVal) {
          logger.info(`Download cache hit for [${url}]`);
          return downloadCacheVal;
        }
      } catch (err) {
        // NOOP (download cache miss)
      }
    }

    const self = this;
    await self.claimRequest();
    return new Promise((resolve, reject) => {
      const requestOptions = this.getRequestOptionsFromUrl(url);
      const call = backoff.call(this.getContentCb, requestOptions, async (err: any, val: any) => {
        self.releaseRequest();
        if (err) {
          const httpStatus = err.response && err.response.status;
          logger.warn(`Failed to get [${url}] [${call.getNumRetries()}] times [status=${httpStatus}]`);
          reject(err);
        } else if (self.useDownloadCache && self.downloadCacheDirectory) {
          try {
            await self.writeToDownloadCache(url, val);
            resolve(val);
          } catch (err) {
            logger.warn(`Failed to cache download for [${url}]`, err);
            reject({ message: `Failed to cache download`, err });
          }
        } else {
          resolve(val);
        }
      });
      call.retryIf((err: any) => err.response && err.response.status !== 404);
      call.setStrategy(new backoff.ExponentialStrategy());
      call.failAfter(5);
      call.start();
    });
  }

  public async canGetUrl(url: string) {
    try {
      await axios.get(url);
      return true;
    } catch (err) {
      return false;
    }
  }

  private async writeToDownloadCache(url: string, val: { content: Buffer, responseHeaders: any }) {
    const fileName = md5(url);
    const filePath = path.join(this.downloadCacheDirectory, fileName);
    logger.info(`Caching response for [${url}] to [${filePath}]`);
    await writeFilePromise(filePath, val.content, null);
    await writeFilePromise(`${filePath}.headers`, JSON.stringify(val.responseHeaders), 'utf8');
  }

  private async readFromDownloadCache(url: string) {
    if (!this.downloadCacheDirectory) {
      throw new Error('No Download Cache Directory Defined');
    }
    const fileName = md5(url);
    const filePath = path.join(this.downloadCacheDirectory, fileName);
    logger.info(`Finding cached donwload for [${url}] ([${filePath}])`);
    const [content, responseHeaders] = await Promise.all([
      readFilePromise(filePath, null),
      readFilePromise(`${filePath}.headers`, 'utf8').catch(() => null),
    ]);
    return {
      content, responseHeaders,
    };
  }

  private stripNonContinuedProps(articleDetails: QueryMwRet, cont: QueryContinueOpts | ContinueOpts = {}): QueryMwRet {
    const propsMap: KVS<string[]> = {
      pageimages: ['thumbnail', 'pageimage'],
      redirects: ['redirects'],
      coordinates: ['coordinates'],
      categories: ['categories'],
    };
    const keysToKeep: string[] = ['subCategories']
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

  private async handleMWWarningsAndErrors(resp: MwApiResponse) {
    if (resp.warnings) {
      logger.warn(`Got warning from MW Query`, JSON.stringify(resp.warnings, null, '\t'));
    }

    if (resp.error) {
      logger.error(`Got error from MW Query`, JSON.stringify(resp.error, null, '\t'));
    }
  }

  private getArticleQueryOpts(includePageimages = false) {
    const validNamespaceIds = this.mw.namespacesToMirror.map((ns) => this.mw.namespaces[ns].num);
    return {
      action: 'query',
      format: 'json',
      prop: `redirects|revisions${includePageimages ? '|pageimages' : ''}${this.canFetchCoordinates ? '|coordinates' : ''}${this.mw.getCategories ? '|categories' : ''}`,
      rdlimit: 'max',
      rdnamespace: validNamespaceIds.join('|'),
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

  private getRequestOptionsFromUrl(url: string): AxiosRequestConfig {
    return {
      url,
      headers: {
        'accept': 'text/html; charset=utf-8; profile="https://www.mediawiki.org/wiki/Specs/HTML/1.8.0"',
        'cache-control': 'public, max-stale=86400',
        'accept-encoding': 'gzip, deflate',
        'user-agent': this.uaString,
        'cookie': this.loginCookie,
      },
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

  private async getCompressedBody(resp: any): Promise<any> {
    return this.isMimeTypeImage(resp.headers['content-type']) ? await imagemin.buffer(resp.data, imageminOptions) : resp.data;
  }

  private getContentCb = async (requestOptions: any, handler: any) => {
    logger.info(`Downloading [${requestOptions.url}]`);

    try {
      if (this.optimisationCacheUrl && this.isImageUrl(requestOptions.url)) {
        this.s3.downloadIfPossible(this.stripHttpFromUrl(requestOptions.url), requestOptions.url).then(async (s3ImageResp) => {
          if (s3ImageResp) {
            handler(null, {
              responseHeaders: s3ImageResp.headers,
              content: s3ImageResp.imgData,
            });
          } else {
            await this.imageDownloadCompressAndUploadToS3(requestOptions, handler);
          }
        }).catch((err) => {
          logger.log(`Not able to download content for ${requestOptions.url} due to ${err}`);
          handler(err);
        });
      } else {
        const resp = await axios(requestOptions);
        handler(null, {
          responseHeaders: resp.headers,
          content: await this.getCompressedBody(resp),
        });
      }
    } catch (err) {
      try {
        if (err.response && err.response.status === 429) {
          logger.log(`Received a [status=429], slowing down`);
          const newMaxActiveRequests = Math.max(Math.ceil(this.maxActiveRequests * 0.9), 1);
          logger.log(`Setting maxActiveRequests from [${this.maxActiveRequests}] to [${newMaxActiveRequests}]`);
          this.maxActiveRequests = newMaxActiveRequests;
          this.getContentCb(requestOptions, handler);
        } else {
          logger.log(`Not able to download content for ${requestOptions.url} due to ${err}`);
          handler(err);
        }
      } catch (a) {
        handler(err);
      }
    }
  }

  private async imageDownloadCompressAndUploadToS3<T>(requestOptions: any, handler: any) {
    const resp = await axios(requestOptions);
    const etag = resp.headers.etag;
    const content = await this.getCompressedBody(resp);
    const compressionWorked = content.length < resp.data.length;
    if (compressionWorked) {
      resp.data = content;
    }

    if (etag) {
      this.s3.uploadBlob(this.stripHttpFromUrl(requestOptions.url), resp.data, etag);
    }

    handler(null, {
      responseHeaders: resp.headers,
      content: compressionWorked ? content : resp.data,
    });
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
