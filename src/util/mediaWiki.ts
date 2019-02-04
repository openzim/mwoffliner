import * as urlParser from 'url';

export interface MWMetaData {
    langIso2: string;
    langIso3: string;
    title: string;
    subTitle: string;
    creator: string;
    textDirection: string;
    mainPage: string;
    ltr: boolean;

    base: any;
    wikiPath: any;
    apiPath: any;
    domain: any;
    webUrl: string;
    apiUrl: string;
    webUrlPath: string;
    modulePath: string;
}

export async function getMwMetaData(): Promise<MWMetaData> {

    const base = `${opts.base.replace(/\/$/, '')}/`;
    const wikiPath = opts.wikiPath !== undefined && opts.wikiPath !== true ? opts.wikiPath : 'wiki/';
    const apiPath = opts.apiPath === undefined ? 'w/api.php' : opts.apiPath;
    const modulePath = opts.modulePath === undefined ? 'w/load.php' : opts.modulePath;
    const webUrl = base + wikiPath;

    return {
        webUrl,
        apiUrl: `${base}${apiPath}?`,
        modulePath: `${base}${modulePath}?`,
        webUrlPath: urlParser.parse(webUrl).pathname,
    };
}




// public async getTextDirection(env: OfflinerEnv, downloader: Downloader) {
//     const self = this;
//     logger.log('Getting text direction...');
//     const { content } = await downloader.downloadContent(this.webUrl);
//     const body = content.toString();
//     const doc = domino.createDocument(body);
//     const contentNode = doc.getElementById('mw-content-text');
//     const languageDirectionRegex = /"pageLanguageDir":"(.*?)"/;
//     const parts = languageDirectionRegex.exec(body);
//     if (parts && parts[1]) {
//       env.ltr = (parts[1] === 'ltr');
//     } else if (contentNode) {
//       env.ltr = (contentNode.getAttribute('dir') === 'ltr');
//     } else {
//       logger.log('Unable to get the language direction, fallback to ltr');
//       env.ltr = true;
//     }
//     logger.log(`Text direction is ${env.ltr ? 'ltr' : 'rtl'}`);
//   }

//   public async getSiteInfo(this: MediaWiki, env: OfflinerEnv, downloader: Downloader) {
//     const self = this;
//     logger.log('Getting web site name...');
//     const url = `${this.apiUrl}action=query&meta=siteinfo&format=json&siprop=general|namespaces|statistics|variables|category|wikidesc`;
//     const { content } = await downloader.downloadContent(url);
//     const body = content.toString();
//     const entries = JSON.parse(body).query.general;
//     /* Welcome page */
//     if (!env.zim.mainPageId && !env.zim.articleList) {
//       env.zim.mainPageId = entries.mainpage.replace(/ /g, self.spaceDelimiter);
//     }
//     /* Site name */
//     if (!env.zim.name) {
//       env.zim.name = entries.sitename;
//     }
//     /* Language */
//     env.zim.langIso2 = entries.lang;
//     countryLanguage.getLanguage(env.zim.langIso2, (error, language) => {
//       if (error || !language.iso639_3) {
//         env.zim.langIso3 = env.zim.langIso2;
//       } else {
//         env.zim.langIso3 = language.iso639_3;
//       }
//     });
//   }