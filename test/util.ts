import MediaWiki from '../src/MediaWiki';
import Downloader from '../src/Downloader';
import { Dump } from '../src/Dump';
import axios from 'axios';
import logger from '../src/Logger';
import { WIKI_TO_HTML_API } from '../src/util/const';
import execa = require('execa');

export function leftPad(_num: number, length: number) {
    const num = `${_num}`;
    return '0'.repeat(length - num.length) + num;
}

export function makeLink($doc: Document, href: string, rel: string, title: string, text: string = href, attributes: KVS<string> = {}) {
    const $link = $doc.createElement('a');
    $link.setAttribute('href', href);
    $link.setAttribute('rel', rel);
    $link.setAttribute('title', title);
    $link.innerHTML = text;

    for (const [key, value] of Object.entries(attributes)) {
        $link.setAttribute(key, value);
    }

    const $wrapper = $doc.createElement('div');
    $wrapper.appendChild($link);
    $doc.body.appendChild($wrapper);

    return $link;
}

export async function setupScrapeClasses({ mwUrl = 'https://en.wikipedia.org', format = '' } = {}) {
    const mw = new MediaWiki({
        base: mwUrl,
    } as any);

    const downloader = new Downloader({ mw, uaString: '', speed: 1, reqTimeout: 1000 * 60, useDownloadCache: false, downloadCacheDirectory: `cac/dumps-${Date.now()}/`, noLocalParserFallback: false, forceLocalParser: false, optimisationCacheUrl: '' });

    await mw.getMwMetaData(downloader);
    await downloader.checkCapabilities();

    const dump = new Dump(format, {} as any, mw.metaData);

    return {
        mw,
        downloader,
        dump,
    };
}

export function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const zimcheckPath = process.env.ZIMCHECK_PATH || 'zimcheck';
export async function zimcheckAvailable() {
    try {
        await execa.command(`which ${zimcheckPath}`);
        return true;
    } catch (err) {
        return false;
    }
}

export async function zimcheck(filePath: string) {
    return execa.command(`${zimcheckPath} ${filePath}`);
}

export async function convertWikicodeToHtml(wikicode: string, dump:Dump): Promise<string>{
    return axios.post(`${dump.mwMetaData.base}${WIKI_TO_HTML_API}`,  {
        "wikitext": wikicode,
        "body_only": true,
      })
      .then((resp: any) => {
          return resp.data;
      }).catch((err) => {
          return err;
    });
}
