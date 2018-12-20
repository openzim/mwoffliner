import Downloader from './Downloader';
import Logger from './Logger';

import countryLanguage from 'country-language';
import domino from 'domino';
import urlParser from 'url';
import * as U from './Utils';
import OfflinerEnv from './OfflinerEnv';

// Stub for now
class MediaWiki {
  public logger: Logger;
  public base: string;
  public wikiPath: string;
  public apiPath: string;
  public modulePath: string;
  public domain: string;
  public username: string;
  public password: string;
  public spaceDelimiter: string;
  public webUrl: string;
  public apiUrl: string;
  public webUrlPath: string;
  public namespaces: {
    [namespace: string]: {
      num: number,
      allowedSubpages: boolean,
      isContent: boolean,
    },
  };
  public namespacesToMirror: string[];

  constructor(logger: Logger, config: { base: any; wikiPath: any; apiPath: any; domain: any; username: any; password: any; spaceDelimiter: string; modulePath: string; }) {
    this.logger = logger;
    // Normalize args
    this.base = `${config.base.replace(/\/$/, '')}/`;
    this.wikiPath = config.wikiPath !== undefined && config.wikiPath !== true ? config.wikiPath : 'wiki/';
    this.apiPath = config.apiPath === undefined ? 'w/api.php' : config.apiPath;
    this.modulePath = config.modulePath === undefined ? 'w/load.php' : config.modulePath;
    this.domain = config.domain || '';
    this.username = config.username;
    this.password = config.password;
    this.spaceDelimiter = config.spaceDelimiter;
    // Computed properties
    this.webUrl = `${this.base + this.wikiPath}`;
    this.apiUrl = `${this.base + this.apiPath}?`;
    this.modulePath = `${this.base + this.modulePath}?`;
    this.webUrlPath = urlParser.parse(this.webUrl).pathname;
    // State
    this.namespaces = {};
    this.namespacesToMirror = [];
  }

  public async login(downloader: Downloader) {
    if (this.username && this.password) {
      let url = `${this.apiUrl}action=login&format=json&lgname=${this.username}&lgpassword=${this.password}`;
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
    return `${this.apiUrl}action=query&meta=siteinfo&format=json`;
  }

  public articleQueryUrl(title: string) {
    return `${this.apiUrl}action=query&redirects&format=json&prop=revisions|coordinates&titles=${encodeURIComponent(title)}`;
  }

  public backlinkRedirectsQueryUrl(articleIds: string[]) {
    const articleIdString = articleIds.map(encodeURIComponent).join('|');
    return `${this.apiUrl}action=query&prop=redirects&format=json&rdprop=title&rdlimit=max&titles=${articleIdString}&rawcontinue=`;
  }

  public pageGeneratorQueryUrl(namespace: string, init: string) {
    return `${this.apiUrl}action=query&generator=allpages&gapfilterredir=nonredirects&gaplimit=max&colimit=max&prop=revisions|coordinates&gapnamespace=${this.namespaces[namespace].num}&format=json&rawcontinue=${init}`;
  }

  public articleApiUrl(articleId) {
    return `${this.apiUrl}action=parse&format=json&page=${encodeURIComponent(articleId)}&prop=${encodeURI('modules|jsconfigvars|headhtml')}`;
  }

  public async getTextDirection(this: MediaWiki, env: OfflinerEnv, downloader: Downloader) {
    const self = this;
    const { logger } = self;
    logger.log('Getting text direction...');
    const { content } = await downloader.downloadContent(this.webUrl);
    const body = content.toString();
    const doc = domino.createDocument(body);
    const contentNode = doc.getElementById('mw-content-text');
    const languageDirectionRegex = /"pageLanguageDir":"(.*?)"/;
    const parts = languageDirectionRegex.exec(body);
    if (parts && parts[1]) {
      env.ltr = (parts[1] === 'ltr');
    } else if (contentNode) {
      env.ltr = (contentNode.getAttribute('dir') === 'ltr');
    } else {
      logger.log('Unable to get the language direction, fallback to ltr');
      env.ltr = true;
    }
    logger.log(`Text direction is ${env.ltr ? 'ltr' : 'rtl'}`);
  }

  public async getSiteInfo(this: MediaWiki, env: OfflinerEnv, downloader: Downloader) {
    const self = this;
    this.logger.log('Getting web site name...');
    const url = `${this.apiUrl}action=query&meta=siteinfo&format=json&siprop=general|namespaces|statistics|variables|category|wikidesc`;
    const { content } = await downloader.downloadContent(url);
    const body = content.toString();
    const entries = JSON.parse(body).query.general;
    /* Welcome page */
    if (!env.zim.mainPageId && !env.zim.articleList) {
      env.zim.mainPageId = entries.mainpage.replace(/ /g, self.spaceDelimiter);
    }
    /* Site name */
    if (!env.zim.name) {
      env.zim.name = entries.sitename;
    }
    /* Language */
    env.zim.langIso2 = entries.lang;
    countryLanguage.getLanguage(env.zim.langIso2, (error, language) => {
      if (error || !language.iso639_3) {
        env.zim.langIso3 = env.zim.langIso2;
      } else {
        env.zim.langIso3 = language.iso639_3;
      }
    });
  }

  public async getNamespaces(addNamespaces: number[], downloader: Downloader) {
    const self = this;
    const url = `${this.apiUrl}action=query&meta=siteinfo&siprop=namespaces|namespacealiases&format=json`;
    const { content } = await downloader.downloadContent(url);
    const body = content.toString();
    const json = JSON.parse(body);
    ['namespaces', 'namespacealiases'].forEach((type) => {
      const entries = json.query[type];
      Object.keys(entries).forEach((key) => {
        const entry = entries[key];
        const name = entry['*'].replace(/ /g, self.spaceDelimiter);
        const num = entry.id;
        const allowedSubpages = ('subpages' in entry);
        const isContent = !!(entry.content !== undefined || U.contains(addNamespaces, num));
        const canonical = entry.canonical ? entry.canonical.replace(/ /g, self.spaceDelimiter) : '';
        const details = { num, allowedSubpages, isContent };
        /* Namespaces in local language */
        self.namespaces[U.lcFirst(name)] = details;
        self.namespaces[U.ucFirst(name)] = details;
        /* Namespaces in English (if available) */
        if (canonical) {
          self.namespaces[U.lcFirst(canonical)] = details;
          self.namespaces[U.ucFirst(canonical)] = details;
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
        return U.decodeURIComponent(pathname.substr(2));
      }
      if (pathname.indexOf(this.webUrlPath) === 0) {
        return U.decodeURIComponent(pathname.substr(this.webUrlPath.length));
      }

      return null; /* Interwiki link? -- return null */
    } catch (error) {
      this.logger.warn(`Unable to parse href ${href}`);
      return null;
    }
  }
}

export default MediaWiki;
