import MediaWiki from '../src/MediaWiki';
import Downloader from '../src/Downloader';
import { Dump } from '../src/Dump';
import { ZimCreator } from '@openzim/libzim';
import pathParser from 'path';
import * as path from 'path';
import fs from 'fs';
import execa = require('execa');
import logger from '../src/Logger';

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

export async function setupScrapeClasses({ mwUrl = 'https://en.wikipedia.org', format = '' } = {}, shouldAddCreator = false) {
    const mw = new MediaWiki({
        base: mwUrl,
    } as any);

    const downloader = new Downloader({ mw, uaString: '', speed: 1, reqTimeout: 1000 * 60, useDownloadCache: false, downloadCacheDirectory: `cac/dumps-${Date.now()}/`, noLocalParserFallback: false, forceLocalParsoid: false, optimisationCacheUrl: '' });

    await mw.getMwMetaData(downloader);
    await downloader.checkCapabilities();

    const dump = new Dump(format, {} as any, mw.metaData);

    if (shouldAddCreator) {
        const zimCreator = new ZimCreator({
            fileName: setupZimCreatorPath(dump),
            fullTextIndexLanguage: dump.opts.withoutZimFullTextIndex ? '' : dump.mwMetaData.langIso3,
            welcome: (dump.opts.mainPage ? dump.getArticleBase(dump.opts.mainPage) : 'index'),
          }, {
              Tags: dump.computeZimTags(),
              Language: dump.mwMetaData.langIso3,
              Title: dump.opts.customZimTitle || dump.mwMetaData.title,
              Name: dump.computeFilenameRadical(false, true, true),
              Flavour: dump.computeFlavour(),
              Description: dump.opts.customZimDescription || dump.mwMetaData.subTitle,
              Creator: dump.mwMetaData.creator,
              Publisher: dump.opts.publisher,
            });
            return {
                mw,
                downloader,
                dump,
                zimCreator
            };
    }
    return {
        mw,
        downloader,
        dump
    };
}

export function setupZimCreatorPath(dump: any) {
    const outputDirectory = path.join(process.cwd(), 'out');
    const outZim = fs.existsSync(outputDirectory) ? pathParser.resolve(outputDirectory, dump.computeFilenameRadical() + '.zim') : pathParser.resolve(dump.computeFilenameRadical() + '.zim')
    return outZim;
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
