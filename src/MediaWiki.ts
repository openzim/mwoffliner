import Downloader from './Downloader';
import logger from './Logger';
import urlParser from 'url';
import * as U from './util';
import * as domino from 'domino';

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
    const json: any = await downloader.getJSON(url);
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

  public async getTextDirection(downloader: Downloader) {
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
        langIso3 = await U.getIso3(lang);
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

    return {
      webUrl: this.webUrl,
      apiUrl: this.apiUrl,
      modulePath: this.modulePath,
      webUrlPath: this.webUrlPath,
      wikiPath: this.wikiPath,
      base: this.base,
      apiPath: this.apiPath,
      domain: this.domain,

      textDir,
      langIso2,
      langIso3,
      title: siteName,
      subTitle,
      creator,
      mainPage,
    };
  }
}

export default MediaWiki;
