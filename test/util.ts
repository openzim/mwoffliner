import domino from 'domino';
import MediaWiki from '../src/MediaWiki';
import Downloader from '../src/Downloader';
import { Dump } from '../src/Dump';

export function leftPad(_num: number, length: number) {
    const num = `${_num}`;
    return '0'.repeat(length - num.length) + num;
}

export function makeLink($doc: Document, href: string, rel: string, title: string, text: string = href) {
    const $link = $doc.createElement('a');
    $link.setAttribute('href', href);
    $link.setAttribute('rel', rel);
    $link.setAttribute('title', title);
    $link.innerHTML = text;

    const $wrapper = $doc.createElement('div');
    $wrapper.appendChild($link);
    $doc.body.appendChild($wrapper);

    return $link;
}

export async function setupScrapeClasses(mwUrl: string = 'https://en.wikipedia.org', format: string = '') {
    const mw = new MediaWiki({
        base: mwUrl,
    } as any);

    const downloader = new Downloader(mw, '', 1, 1000 * 60, false, `cac/dumps-${Date.now()}/`);

    const mwMetadata = await mw.getMwMetaData(downloader);

    const dump = new Dump(format, {} as any, mwMetadata);

    return {
        mw,
        downloader,
        dump,
    };
}
