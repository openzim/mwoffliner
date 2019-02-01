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