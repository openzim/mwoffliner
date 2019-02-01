import fs from 'fs';
import mkdirp from 'mkdirp';
import pathParser from 'path';
import urlParser, { UrlWithStringQuery } from 'url';
import { exec } from 'child_process';
import { ZimCreator, ZimArticle } from 'libzim-binding';
import { Config } from '../config';
import logger from '../Logger';

export function isValidEmail(email) {
  const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return emailRegex.test(email);
}

export function lcFirst(str) {
  str += '';
  const f = str.charAt(0).toLowerCase();
  return f + str.substr(1);
}

export function ucFirst(str) {
  str += '';
  const f = str.charAt(0).toUpperCase();
  return f + str.substr(1);
}

function _decodeURIComponent(uri) {
  try {
    return decodeURIComponent(uri);
  } catch (error) {
    console.warn(error);
    return uri;
  }
}
export { _decodeURIComponent as decodeURIComponent }

export function touch(paths) {
  const currentDate = Date.now();
  paths = paths instanceof Array ? paths : [paths];
  paths.forEach((path) => {
    fs.utimes(path, currentDate, currentDate, () => null);
  });
}

export function getFullUrl(webUrlHost, url, baseUrl?) {
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

export function randomString(len) {
  let str = '';
  const charSet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < len; i += 1) {
    const randomPoz = Math.floor(Math.random() * charSet.length);
    str += charSet.substring(randomPoz, randomPoz + 1);
  }
  return str;
}

// export function getCreatorName(mw: MediaWiki) {
//   /*
//    * Find a suitable name to use for ZIM (content) creator
//    * Heuristic: Use basename of the domain unless
//    * - it happens to be a wikimedia project OR
//    * - some domain where the second part of the hostname is longer than the first part
//    */
//   const hostParts = urlParser.parse(mw.base).hostname.split('.');
//   let creator = hostParts[0];
//   if (hostParts.length > 1) {
//     const wmProjects = [
//       'wikipedia',
//       'wikisource',
//       'wikibooks',
//       'wikiquote',
//       'wikivoyage',
//       'wikiversity',
//       'wikinews',
//       'wiktionary',
//     ];
//     if (contains(wmProjects, hostParts[1]) || hostParts[0].length < hostParts[1].length) {
//       creator = hostParts[1]; // Name of the wikimedia project
//     }
//   }
//   creator = creator.charAt(0).toUpperCase() + creator.substr(1);
//   return creator;
// }

// export function checkDependencies(env: OfflinerEnv) {
//   /* Check if opt. binaries are available */
//   const shouldCheckZimwriterFs = env.dumps.some((dump) => !dump.toLowerCase().includes('nozim'));
//   const optBinaries = [
//     'jpegoptim --version',
//     'pngquant --version',
//     'gifsicle --version',
//     'advdef --version',
//     'file --help',
//     // 'stat --version',
//     'convert --version',
//     'rsvg-convert --version',
//     shouldCheckZimwriterFs ? 'zimwriterfs --help' : null,
//   ].filter((a) => a);

//   return Promise.all(
//     optBinaries.map((execCommand) => {
//       return new Promise((resolve, reject) => {
//         exec(execCommand, (error) => {
//           if (error) { reject(error); } else { resolve(); }
//         });
//       });
//     }),
//   );
// }

export function mkdirPromise(path: string) {
  return new Promise((resolve, reject) => {
    mkdirp(path, (err) => {
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

export function execPromise(cmd) {
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

export function contains(arr, value) {
  return arr.some((v) => v === value);
}

/*
 * Move 'from'.childNodes to 'to' adding them before 'beforeNode'
 * If 'beforeNode' is null, the nodes are appended at the end.
 */
export function migrateChildren(from, to, beforeNode) {
  if (beforeNode === undefined) {
    beforeNode = null;
  }
  while (from.firstChild) {
    to.insertBefore(from.firstChild, beforeNode);
  }
}

export function getStringsForLang(language, fallbackLanguage = 'en') {
  let strings: { [id: string]: string } = {};
  try {
    strings = require(`../translation/${language}.json`);
  } catch (err) {
    console.warn(`Couldn't find strings file for [${language}], falling back to [${fallbackLanguage}]`);
    strings = require(`../translation/${fallbackLanguage}.json`);
  }
  return strings;
}

export function saveStaticFiles(config: Config, zimCreator: ZimCreator) {
  const cssPromises = config.output.cssResources
    .concat(config.output.mainPageCssResources)
    .map(async (css) => {
      try {
        const cssCont = await readFilePromise(pathParser.resolve(__dirname, `../res/${css}.css`));
        const article = new ZimArticle(cssPath(config, css), cssCont, 'A');
        await zimCreator.addArticle(article);
      } catch (error) {
        logger.warn(`Could not create ${css} file : ${error}`);
      }
    });

  const jsPromises = config.output.jsResources.map(async (js) => {
    try {
      const jsCont = await readFilePromise(pathParser.resolve(__dirname, `../res/${js}.js`));
      const article = new ZimArticle(jsPath(config, js), jsCont, 'A');
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
  return `<link href="${cssPath(config, css)}" rel="stylesheet" type="text/css" class="${classList}" />`;
}
export function genHeaderScript(config: Config, js: string, classList = '') {
  return `<script src="${jsPath(config, js)}" class="${classList}"></script>`;
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
