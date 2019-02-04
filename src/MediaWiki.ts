import Downloader from './Downloader';
import logger from './Logger';

import countryLanguage from 'country-language';
import urlParser from 'url';
import * as U from './util';

// Stub for now
class MediaWiki {
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

  constructor(config: { base: any; wikiPath: any; apiPath: any; domain: any; username: any; password: any; spaceDelimiter: string; modulePath: string; }) {
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

  public imageQueryUrl(title: string) {
    return `${this.apiUrl}action=query&prop=pageimages&pithumbsize=300&format=json&titles=${encodeURIComponent(title)}`;
  }

  public articleQueryUrl(title: string) {
    return `${this.apiUrl}action=query&redirects&format=json&prop=revisions|coordinates&titles=${encodeURIComponent(title)}`;
  }

  public pageGeneratorQueryUrl(namespace: string, init: string) {
    return `${this.apiUrl}action=query&generator=allpages&gapfilterredir=nonredirects&gaplimit=max&colimit=max&prop=revisions|coordinates&gapnamespace=${this.namespaces[namespace].num}&format=json&rawcontinue=${init}`;
  }

  public articleApiUrl(articleId: string) {
    return `${this.apiUrl}action=parse&format=json&page=${encodeURIComponent(articleId)}&prop=${encodeURI('modules|jsconfigvars|headhtml')}`;
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
      logger.warn(`Unable to parse href ${href}`);
      return null;
    }
  }
}

export default MediaWiki;
