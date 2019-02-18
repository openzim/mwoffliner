import crypto from 'crypto';
import unicodeCutter from 'utf8-binary-cutter';
import countryLanguage from 'country-language';
import fs from 'fs';
import mkdirp from 'mkdirp';
import pathParser from 'path';
import urlParser, { UrlWithStringQuery } from 'url';
import { exec } from 'child_process';
import { ZimCreator, ZimArticle } from '@openzim/libzim';
import { Config, config } from '../config';
import logger from '../Logger';
import { MEDIA_REGEX } from '.';

export function isValidEmail(email: string) {
  const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return emailRegex.test(email);
}

export function lcFirst(str: string) {
  str += '';
  const f = str.charAt(0).toLowerCase();
  return f + str.substr(1);
}

export function ucFirst(str: string) {
  str += '';
  const f = str.charAt(0).toUpperCase();
  return f + str.substr(1);
}

function _decodeURIComponent(uri: string) {
  try {
    return decodeURIComponent(uri);
  } catch (error) {
    console.warn(error);
    return uri;
  }
}
export { _decodeURIComponent as decodeURIComponent };

export function touch(paths: string[] | string) {
  const currentDate = Date.now();
  paths = paths instanceof Array ? paths : [paths];
  paths.forEach((path) => {
    fs.utimes(path, currentDate, currentDate, () => null);
  });
}

export function getFullUrl(webUrlHost: string, url: string, baseUrl?: string) {
  const urlObject = urlParser.parse(url, false, true);
  if (!urlObject.protocol) {
    const baseUrlObject = baseUrl ? urlParser.parse(baseUrl, false, true) : {} as UrlWithStringQuery;
    urlObject.protocol = urlObject.protocol || baseUrlObject.protocol || 'http:';
    urlObject.host = urlObject.host || baseUrlObject.host || webUrlHost;

    /* Relative path */
    if (urlObject.pathname && urlObject.pathname.indexOf('/') !== 0 && baseUrlObject.pathname) {
      urlObject.pathname = `${pathParser.dirname(baseUrlObject.pathname)}/${urlObject.pathname}`;
    }

    url = urlParser.format(urlObject);
  }

  return url;
}

export function randomString(len: number) {
  let str = '';
  const charSet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < len; i += 1) {
    const randomPoz = Math.floor(Math.random() * charSet.length);
    str += charSet.substring(randomPoz, randomPoz + 1);
  }
  return str;
}

export function mkdirPromise(path: string) {
  return new Promise((resolve, reject) => {
    mkdirp(path, (err: any) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export function writeFilePromise(path: string, content: string | Buffer) {
  return new Promise((resolve, reject) => {
    fs.writeFile(path, content, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export function readFilePromise(path: string, encoding = 'utf8') {
  return new Promise<string | Buffer>((resolve, reject) => {
    fs.readFile(path, encoding, (err, content) => {
      if (err) {
        reject(err);
      } else {
        resolve(content);
      }
    });
  });
}

export function execPromise(cmd: string) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout) => {
      if (err) {
        reject(err);
      } else {
        resolve(stdout);
      }
    });
  });
}

export function contains(arr: any[], value: any) {
  return arr.some((v) => v === value);
}

/*
 * Move 'from'.childNodes to 'to' adding them before 'beforeNode'
 * If 'beforeNode' is null, the nodes are appended at the end.
 */
export function migrateChildren(from: any, to: any, beforeNode: any) {
  if (beforeNode === undefined) {
    beforeNode = null;
  }
  while (from.firstChild) {
    to.insertBefore(from.firstChild, beforeNode);
  }
}

export function getStringsForLang(language: string, fallbackLanguage = 'en') {
  let strings: { [id: string]: string } = {};
  try {
    strings = require(`../../translation/${language}.json`);
  } catch (err) {
    console.warn(`Couldn't find strings file for [${language}], falling back to [${fallbackLanguage}]`);
    strings = require(`../../translation/${fallbackLanguage}.json`);
  }
  return strings;
}

export function saveStaticFiles(config: Config, zimCreator: ZimCreator) {
  const cssPromises = config.output.cssResources
    .concat(config.output.mainPageCssResources)
    .map(async (css) => {
      try {
        const cssCont = await readFilePromise(pathParser.resolve(__dirname, `../../res/${css}.css`));
        const article = new ZimArticle(cssPath(config, css), cssCont, '-');
        await zimCreator.addArticle(article);
      } catch (error) {
        logger.warn(`Could not create ${css} file : ${error}`);
      }
    });

  const jsPromises = config.output.jsResources.map(async (js) => {
    try {
      const jsCont = await readFilePromise(pathParser.resolve(__dirname, `../../res/${js}.js`));
      const article = new ZimArticle(jsPath(config, js), jsCont, '-');
      await zimCreator.addArticle(article);
    } catch (error) {
      logger.warn(`Could not create ${js} file : ${error}`);
    }
  });
  return Promise.all([
    ...cssPromises,
    ...jsPromises,
  ]);
}

export function cssPath({ output: { dirs } }: Config, css: string) {
  return [dirs.style, `${dirs.styleModules}-${css.replace(/(\.css)?$/, '')}.css`].join('/');
}
export function jsPath({ output: { dirs } }: Config, js: string) {
  return [dirs.javascript, `${dirs.jsModules}-${js.replace(/(\.js)?$/, '')}.js`].join('/');
}
export function genHeaderCSSLink(config: Config, css: string, classList = '') {
  const resourceNamespace = '-';
  return `<link href="/${resourceNamespace}/${cssPath(config, css)}" rel="stylesheet" type="text/css" class="${classList}" />`;
}
export function genHeaderScript(config: Config, js: string, classList = '') {
  const resourceNamespace = '-';
  return `<script src="/${resourceNamespace}/${jsPath(config, js)}" class="${classList}"></script>`;
}

export function getDumps(format: boolean | boolean[]) {
  let dumps: any[];
  if (format) {
    if (format instanceof Array) {
      dumps = [];
      const self =
        format.forEach((value) => {
          dumps.push(value === true ? '' : value);
        });
    } else if (format !== true) {
      dumps = [format];
    }
  } else {
    dumps = [''];
  }
  return dumps;
}

export function getIso3(langIso2: string): Promise<string> {
  return new Promise((resolve, reject) => {
    countryLanguage.getLanguage(langIso2, (error: any, language: KVS<any>) => {
      if (error || !language.iso639_3) {
        reject(error);
      } else {
        resolve(language.iso639_3 as string);
      }
    });
  });
}

/* Internal path/url functions */
export function getMediaBase(url: string, escape: boolean, dir: string = config.output.dirs.media) {
  let root;

  const parts = MEDIA_REGEX.exec(decodeURI(url));
  if (parts) {
    root = parts[2].length > parts[5].length ? parts[2] : parts[5] + (parts[6] || '.svg') + (parts[7] || '');
  }

  if (!root) {
    logger.warn(`Unable to parse media url "${url}"`);
    return '';
  }

  function e(str: string) {
    if (typeof str === 'undefined') {
      return undefined;
    }
    return escape ? encodeURIComponent(str) : str;
  }

  const filenameFirstVariant = parts[2];
  const filenameSecondVariant = parts[5] + (parts[6] || '.svg') + (parts[7] || '');
  let filename = decodeURIComponent(
    filenameFirstVariant.length > filenameSecondVariant.length ? filenameFirstVariant : filenameSecondVariant,
  );
  /* Need to shorten the file due to filesystem limitations */
  if (unicodeCutter.getBinarySize(filename) > 249) {
    const ext = pathParser.extname(filename).split('.')[1] || '';
    const basename = filename.substring(0, filename.length - ext.length - 1) || '';
    filename = `${unicodeCutter.truncateToBinarySize(basename, 239 - ext.length)
      + crypto.createHash('md5').update(basename).digest('hex').substring(0, 2)}.${ext}`;
  }

  return `${dir}/${e(filename)}`;
}
