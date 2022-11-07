import MediaWiki from '../src/MediaWiki';
import Downloader from '../src/Downloader';
import { Dump } from '../src/Dump';
import { config } from 'src/config';
import axios from 'axios';
import execa from 'execa';
import logger from '../src/Logger';
import 'dotenv/config';

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

    const downloader = new Downloader({ mw, uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, noLocalParserFallback: false, forceLocalParser: false, webp: false, optimisationCacheUrl: '' });

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

export async function convertWikicodeToHtml(wikicode: string, baseUrl: string): Promise<any> {
    try {
        return await axios.post(`${baseUrl}api/rest_v1/transform/wikitext/to/html`,  {
            wikitext: wikicode,
            body_only: true,
        })
    } catch (err){
        logger.log(`Got error during conversion of wikicode to HTML due to ${err}`);
        return err;
    }
}

export async function testHtmlRewritingE2e(t: any, wikicode: string, html: string, comment: string) {
    const resultHtml = await convertWikicodeToHtml(wikicode, 'https://en.wikipedia.org/');
    t.equal(html, resultHtml.data, comment);
}
