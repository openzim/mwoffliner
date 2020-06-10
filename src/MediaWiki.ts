import urlParser from 'url';
import * as pathParser from 'path';
import logger from './Logger';
import * as util from './util';
import * as domino from 'domino';
import type Downloader from './Downloader';
import { ensureTrailingChar } from './util';


class MediaWiki {
  public metaData: MWMetaData;
  public readonly base: string;
  public readonly apiResolvedPath: string;
  public readonly apiResolvedUrl: string;
  public readonly modulePath: string;
  public readonly spaceDelimiter: string;
  public readonly webUrl: string;
  public readonly veApiUrl: string;
  public readonly restApiUrl: string;
  public readonly getCategories: boolean;
  public readonly namespaces: MWNamespaces = {};
  public readonly namespacesToMirror: string[] = [];

  private readonly wikiPath: string;
  private readonly username: string;
  private readonly password: string;
  private readonly apiPath: string;
  private readonly domain: string;
  private readonly webUrlPath: string;
  private readonly articleApiUrlBase: string;

  constructor(config: MWConfig) {
    this.domain = config.domain || '';
    this.username = config.username;
    this.password = config.password;
    this.spaceDelimiter = config.spaceDelimiter || '_';
    this.getCategories = config.getCategories;

    this.base = ensureTrailingChar(config.base, '/');

    this.apiPath = config.apiPath ?? 'w/api.php';
    this.wikiPath = config.wikiPath ?? 'wiki/';

    this.webUrl = urlParser.resolve(this.base, this.wikiPath);

    this.apiResolvedUrl = urlParser.resolve(this.base, this.apiPath);
    this.veApiUrl = `${this.apiResolvedUrl}?`;
    this.apiResolvedPath = urlParser.parse(this.veApiUrl).pathname;

    this.restApiUrl = ensureTrailingChar(new URL(config.restApiPath ?? 'api/rest_v1', this.base).toString(), '/');

    this.modulePath = `${urlParser.resolve(this.base, config.modulePath ?? 'w/load.php')}?`;
    this.webUrlPath = urlParser.parse(this.webUrl).pathname;
    this.articleApiUrlBase = `${this.veApiUrl}action=parse&format=json&prop=${encodeURI('modules|jsconfigvars|headhtml')}&page=`;
  }

  public async login(downloader: Downloader) {
    if (this.username && this.password) {
      let url = `${this.veApiUrl}action=login&format=json&lgname=${this.username}&lgpassword=${this.password}`;
      if (this.domain) {
        url = `${url}&lgdomain=${this.domain}`;
      }
      const { content } = await downloader.downloadContent(url);
      let body = content.toString();
      let jsonResponse = JSON.parse(body).login;
      downloader.loginCookie = `${jsonResponse.cookieprefix}_session=${jsonResponse.sessionid}`;
      if (jsonResponse.result !== 'SUCCESS') {
        url = `${url}&lgtoken=${jsonResponse.token}`;
        const { content: subContent } = await downloader.downloadContent(url);
        body = subContent.toString();
        jsonResponse = JSON.parse(body).login;
        if (jsonResponse.result !== 'Success') {
          throw new Error('Login Failed');
        }
        downloader.loginCookie = `${jsonResponse.cookieprefix}_session=${jsonResponse.sessionid}`;
      }
    }
  }

  // In all the url methods below:
  // * encodeURIComponent is mandatory for languages with illegal letters for uri (fa.wikipedia.org)
  // * encodeURI is mandatory to encode the pipes '|' but the '&' and '=' must not be encoded
  public siteInfoUrl() {
    return `${this.veApiUrl}action=query&meta=siteinfo&format=json`;
  }

  public articleApiUrl(articleId: string): string {
    return `${this.articleApiUrlBase}${encodeURIComponent(articleId)}`;
  }

  public subCategoriesApiUrl(articleId: string, continueStr: string = '') {
    return `${this.veApiUrl}action=query&list=categorymembers&cmtype=subcat&cmlimit=max&format=json&cmtitle=${encodeURIComponent(articleId)}&cmcontinue=${continueStr}`;
  }

  public async getNamespaces(addNamespaces: number[], downloader: Downloader) {
    const self = this;
    const url = `${this.veApiUrl}action=query&meta=siteinfo&siprop=namespaces|namespacealiases&format=json`;
    const json: any = await downloader.getJSON(url);
    ['namespaces', 'namespacealiases'].forEach((type) => {
      const entries = json.query[type];
      Object.keys(entries).forEach((key) => {
        const entry = entries[key];
        const name = entry['*'].replace(/ /g, self.spaceDelimiter);
        const num = entry.id;
        const allowedSubpages = ('subpages' in entry);
        const isContent = !!(entry.content !== undefined || util.contains(addNamespaces, num));
        const canonical = entry.canonical ? entry.canonical.replace(/ /g, self.spaceDelimiter) : '';
        const details = { num, allowedSubpages, isContent };
        /* Namespaces in local language */
        self.namespaces[util.lcFirst(name)] = details;
        self.namespaces[util.ucFirst(name)] = details;
        /* Namespaces in English (if available) */
        if (canonical) {
          self.namespaces[util.lcFirst(canonical)] = details;
          self.namespaces[util.ucFirst(canonical)] = details;
        }
        /* Is content to mirror */
        if (isContent) {
          self.namespacesToMirror.push(name);
        }
      });
    });
  }

  public extractPageTitleFromHref(href: any) {
    try {
      const pathname = urlParser.parse(href, false, true).pathname || '';
      if (pathname.indexOf('./') === 0) {
        return util.decodeURIComponent(pathname.substr(2));
      }
      if (pathname.indexOf(this.webUrlPath) === 0) {
        return util.decodeURIComponent(pathname.substr(this.webUrlPath.length));
      }
      const isPaginatedRegExp = /\/[0-9]+(\.|$)/;
      const isPaginated = isPaginatedRegExp.test(href);
      if (isPaginated) {
        const withoutDotHtml = href.split('.').slice(0, -1).join('.');
        const lastTwoSlashes = withoutDotHtml.split('/').slice(-2).join('/');
        return lastTwoSlashes;
      }
      if (pathParser.parse(href).dir.includes('../')) {
        return pathParser.parse(href).name;
      }

      return null; /* Interwiki link? -- return null */
    } catch (error) {
      logger.warn(`Unable to parse href ${href}`);
      return null;
    }
  }

  public getCreatorName() {
    /*
     * Find a suitable name to use for ZIM (content) creator
     * Heuristic: Use basename of the domain unless
     * - it happens to be a wikimedia project OR
     * - some domain where the second part of the hostname is longer than the first part
     */
    const hostParts = urlParser.parse(this.base).hostname.split('.');
    let creator = hostParts[0];
    if (hostParts.length > 1) {
      const wmProjects = new Set([
        'wikipedia',
        'wikisource',
        'wikibooks',
        'wikiquote',
        'wikivoyage',
        'wikiversity',
        'wikinews',
        'wiktionary',
      ]);

      if (wmProjects.has(hostParts[1]) || hostParts[0].length < hostParts[1].length) {
        creator = hostParts[1]; // Name of the wikimedia project
      }
    }
    creator = creator.charAt(0).toUpperCase() + creator.substr(1);
    return creator;
  }

  public async getTextDirection(downloader: Downloader): Promise<TextDirection> {
    logger.log('Getting text direction...');
    const { content } = await downloader.downloadContent(this.webUrl);
    const body = content.toString();
    const doc = domino.createDocument(body);
    const contentNode = doc.getElementById('mw-content-text');
    const languageDirectionRegex = /"pageLanguageDir":"(.*?)"/;
    const parts = languageDirectionRegex.exec(body);
    let isLtr = true;
    if (parts && parts[1]) {
      isLtr = (parts[1] === 'ltr');
    } else if (contentNode) {
      isLtr = (contentNode.getAttribute('dir') === 'ltr');
    } else {
      logger.log('Unable to get the language direction, fallback to ltr');
      isLtr = true;
    }
    const textDir = isLtr ? 'ltr' : 'rtl';
    logger.log(`Text direction is [${textDir}]`);
    return textDir;
  }

  public async getSiteInfo(downloader: Downloader) {
    const self = this;
    logger.log('Getting site info...');
    const query = `action=query&meta=siteinfo&format=json&siprop=general|namespaces|statistics|variables|category|wikidesc`;
    const body = await downloader.query(query);
    const entries = body.query.general;

    const mainPage = entries.mainpage.replace(/ /g, self.spaceDelimiter);
    const siteName = entries.sitename;

    const langs: string[] = [entries.lang].concat(entries.fallback.map((e: any) => e.code));

    const [langIso2, langIso3] = await Promise.all(langs.map(async (lang: string) => {
      let langIso3;
      try {
        langIso3 = await util.getIso3(lang);
      } catch (err) {
        langIso3 = lang;
      }
      try {
        return [
          lang,
          langIso3,
        ];
      } catch (err) {
        return false;
      }
    })).then((possibleLangPairs) => {
      possibleLangPairs = possibleLangPairs.filter((a) => a);
      return possibleLangPairs[0] || ['en', 'eng'];
    });

    return {
      mainPage,
      siteName,
      langIso2,
      langIso3,
    };
  }

  public async getSubTitle(downloader: Downloader) {
    logger.log('Getting sub-title...');
    const { content } = await downloader.downloadContent(this.webUrl);
    const html = content.toString();
    const doc = domino.createDocument(html);
    const subTitleNode = doc.getElementById('siteSub');
    return subTitleNode ? subTitleNode.innerHTML : '';
  }

  public async getMwMetaData(downloader: Downloader): Promise<MWMetaData> {

    if (this.metaData) { return this.metaData; }

    const creator = this.getCreatorName() || 'Kiwix';

    const [
      textDir,
      { langIso2, langIso3, mainPage, siteName },
      subTitle,
    ] = await Promise.all([
      this.getTextDirection(downloader),
      this.getSiteInfo(downloader),
      this.getSubTitle(downloader),
    ]);

    const mwMetaData: MWMetaData = {
      webUrl: this.webUrl,
      apiUrl: this.veApiUrl,
      modulePath: this.modulePath,
      webUrlPath: this.webUrlPath,
      wikiPath: this.wikiPath,
      base: this.base,
      apiPath: this.apiPath,
      domain: this.domain,

      textDir: textDir as TextDirection,
      langIso2,
      langIso3,
      title: siteName,
      subTitle,
      creator,
      mainPage,
    };

    this.metaData = mwMetaData;

    return mwMetaData;
  }
}

export default MediaWiki;
