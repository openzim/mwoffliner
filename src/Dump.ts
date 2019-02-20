import * as pathParser from 'path';
import * as urlParser from 'url';
import { AsyncQueue } from 'async';
import { existsSync } from 'fs';
import * as domino from 'domino';
import logger from './Logger';
import Downloader from './Downloader';
import { getStringsForLang } from './util';

interface DumpOpts {
    tmpDir: string;
    username: string;
    password: string;
    spaceDelimiter: string;
    outputDirectory: string;
    cacheDirectory: string;
    keepHtml: boolean;
    publisher: string;
    withoutZimFullTextIndex: boolean;
    customZimTags?: string;
    customZimTitle?: string;
    customZimDescription?: string;
    mainPage?: string;
    filenamePrefix?: string;
    articleList?: string;
    resume?: boolean;
    minifyHtml: boolean;
    keepEmptyParagraphs: boolean;
}

export class Dump {
    public nopic: boolean;
    public novid: boolean;
    public nopdf: boolean;
    public nozim: boolean;
    public nodet: boolean;
    public contentDate: string;
    public opts: DumpOpts;
    public strings: KVS<string>;
    public mwMetaData: MWMetaData;

    public mediaQueue: AsyncQueue<string>;

    constructor(format: string, opts: DumpOpts, mwMetaData: MWMetaData) {
        this.mwMetaData = mwMetaData;
        this.opts = opts;

        this.nopic = format.toString().search('nopic') >= 0;
        this.novid = format.toString().search('novid') >= 0;
        this.nopdf = format.toString().search('nopdf') >= 0;
        this.nozim = format.toString().search('nozim') >= 0;
        this.nodet = format.toString().search('nodet') >= 0;

        const date = new Date();
        this.contentDate = `${date.getFullYear()}-${(`0${date.getMonth() + 1}`).slice(-2)}`;

        this.opts.cacheDirectory = pathParser.join(opts.cacheDirectory, this.computeFilenameRadical(true, true, true));

        /* Get language specific strings */
        this.strings = getStringsForLang(mwMetaData.langIso2 || 'en', 'en');
    }

    public computeFilenameRadical(withoutSelection?: boolean, withoutContentSpecifier?: boolean, withoutDate?: boolean) {
        let radical;
        if (this.opts.filenamePrefix) {
            radical = this.opts.filenamePrefix;
        } else {
            radical = `${this.mwMetaData.creator.charAt(0).toLowerCase() + this.mwMetaData.creator.substr(1)}_`;
            const hostParts = urlParser.parse(this.mwMetaData.webUrl).hostname.split('.');
            let langSuffix = this.mwMetaData.langIso2;
            // tslint:disable-next-line:prefer-for-of
            for (const part of hostParts) {
                if (part === this.mwMetaData.langIso3) {
                    langSuffix = part;
                    break;
                }
            }
            radical += langSuffix;
        }
        if (!withoutSelection && !this.opts.filenamePrefix) {
            if (this.opts.articleList) {
                radical += `_${pathParser.basename(this.opts.articleList, pathParser.extname(this.opts.articleList)).toLowerCase().replace(/ /g, this.opts.spaceDelimiter)}`;
            } else {
                radical += '_all';
            }
        }
        if (!withoutContentSpecifier) {
            if (this.nopic) {
                radical += '_nopic';
            } else if (this.nopdf) {
                radical += '_nopdf';
            } else if (this.novid && !this.nodet) {
                radical += '_novid';
            }
            radical += this.nodet ? '_nodet' : '';
        }
        if (!withoutDate) {
            radical += `_${this.contentDate}`;
        }
        return radical;
    }

    public checkResume() {
        if (this.opts.resume && !this.nozim) {
            const zimPath = this.computeZimRootPath();
            if (existsSync(zimPath)) {
                logger.log(`${zimPath} is already done, skip dumping & ZIM file generation`);
                throw new Error(`TODO: IMPLEMENT RESUME`);
            }
        }
    }

    public computeZimRootPath() {
        let zimRootPath = this.opts.outputDirectory[0] === '/' ? this.opts.outputDirectory : `${pathParser.resolve(process.cwd(), this.opts.outputDirectory)}/`;
        zimRootPath += `${this.computeFilenameRadical()}.zim`;
        return zimRootPath;
    }

    public async getRelevantStylesheetUrls(downloader: Downloader) { // TODO: consider moving to Downloader
        const sheetUrls: Array<string | DominoElement> = [];

        /* Load main page to see which CSS files are needed */
        const { content } = await downloader.downloadContent(this.mwMetaData.webUrl);
        const html = content.toString();
        const doc = domino.createDocument(html);
        const links = doc.getElementsByTagName('link');

        /* Go through all CSS links */
        // tslint:disable-next-line:prefer-for-of
        for (let i = 0; i < links.length; i += 1) {
            const link = links[i];
            if (link.getAttribute('rel') === 'stylesheet') {
                sheetUrls.push(link);
            }
        }

        /* Push Mediawiki:Offline.css (at the end) */
        const offlineCssUrl = `${this.mwMetaData.webUrl}Mediawiki:offline.css?action=raw`;
        sheetUrls.push(offlineCssUrl);

        return sheetUrls.filter((a) => a);
    }

    public getArticleUrl(articleId: string) {
        return this.getArticleBase(articleId, true);
    }

    public getArticleBase(articleId: string, escape?: boolean) {
        let filename = this.nozim ? articleId.replace(/\//g, this.opts.spaceDelimiter) : articleId;
        /* Filesystem is not able to handle with filename > 255 bytes */
        while (Buffer.byteLength(filename, 'utf8') > 250) {
            filename = filename.substr(0, filename.length - 1);
        }
        function e(str: string) {
            if (typeof str === 'undefined') {
                return undefined;
            }
            return escape ? encodeURIComponent(str) : str;
        }
        return e(filename) + (this.nozim ? '.html' : '');
    }

}
