import fs from 'fs';
import mkdirp from 'mkdirp';
import pathParser from 'path';
import urlParser, { UrlWithStringQuery } from 'url';
import MediaWiki from './MediaWiki';
import OfflinerEnv from './OfflinerEnv';
import { exec } from 'child_process';
import axios from 'axios';

function isValidEmail(email) {
  const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return emailRegex.test(email);
}

function lcFirst(str) {
  str += '';
  const f = str.charAt(0).toLowerCase();
  return f + str.substr(1);
}

function ucFirst(str) {
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

function touch(paths) {
  const currentDate = Date.now();
  paths = paths instanceof Array ? paths : [paths];
  paths.forEach((path) => {
    fs.utimes(path, currentDate, currentDate, () => null);
  });
}

function getFullUrl(webUrlHost, url, baseUrl?) {
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

function randomString(len) {
  let str = '';
  const charSet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < len; i += 1) {
    const randomPoz = Math.floor(Math.random() * charSet.length);
    str += charSet.substring(randomPoz, randomPoz + 1);
  }
  return str;
}

function getCreatorName(mw: MediaWiki) {
  /*
   * Find a suitable name to use for ZIM (content) creator
   * Heuristic: Use basename of the domain unless
   * - it happens to be a wikimedia project OR
   * - some domain where the second part of the hostname is longer than the first part
   */
  const hostParts = urlParser.parse(mw.base).hostname.split('.');
  let creator = hostParts[0];
  if (hostParts.length > 1) {
    const wmProjects = [
      'wikipedia',
      'wikisource',
      'wikibooks',
      'wikiquote',
      'wikivoyage',
      'wikiversity',
      'wikinews',
      'wiktionary',
    ];
    if (contains(wmProjects, hostParts[1]) || hostParts[0].length < hostParts[1].length) {
      creator = hostParts[1]; // Name of the wikimedia project
    }
  }
  creator = creator.charAt(0).toUpperCase() + creator.substr(1);
  return creator;
}

function checkDependencies(env: OfflinerEnv) {
  /* Check if opt. binaries are available */
  const shouldCheckZimwriterFs = env.dumps.some((dump) => !dump.toLowerCase().includes('nozim'));
  const optBinaries = [
    'jpegoptim --version',
    'pngquant --version',
    'gifsicle --version',
    'advdef --version',
    'file --help',
    // 'stat --version',
    'convert --version',
    'rsvg-convert --version',
    shouldCheckZimwriterFs ? 'zimwriterfs --help' : null,
  ].filter((a) => a);

  return Promise.all(
    optBinaries.map((execCommand) => {
      return new Promise((resolve, reject) => {
        exec(execCommand, (error) => {
          if (error) { reject(error); } else { resolve(); }
        });
      });
    }),
  );
}

function doSeries(funcs: Array<(...args: any[]) => Promise<any>>) {
  return funcs.filter((a) => a).reduce((p, func) => {
    return p.then(func);
  }, Promise.resolve());
}

function mkdirPromise(path: string) {
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

function writeFilePromise(path: string, content: string | Buffer) {
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

function readFilePromise(path: string, encoding = 'utf8') {
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

function execPromise(cmd) {
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

function contains(arr, value) {
  return arr.some((v) => v === value);
}

/*
 * Move 'from'.childNodes to 'to' adding them before 'beforeNode'
 * If 'beforeNode' is null, the nodes are appended at the end.
 */
function migrateChildren(from, to, beforeNode) {
  if (beforeNode === undefined) {
    beforeNode = null;
  }
  while (from.firstChild) {
    to.insertBefore(from.firstChild, beforeNode);
  }
}

function getStringsForLang(language, fallbackLanguage = 'en') {
  let strings: { [id: string]: string } = {};
  try {
    strings = require(`../translation/${language}.json`);
  } catch (err) {
    console.warn(`Couldn't find strings file for [${language}], falling back to [${fallbackLanguage}]`);
    strings = require(`../translation/${fallbackLanguage}.json`);
  }
  return strings;
}

function makeArticleListItem(env, articleEntry) {
  return `<li><a href="${env.getArticleBase(articleEntry.title, true)}">${articleEntry.title.replace(/_/g, ' ')}<a></li>\n`;
}

function makeArticleImageTile(env, articleEntry) {
  return `<a class="item" href="${env.getArticleBase(articleEntry.title, true)}"><figure><img src="${articleEntry.thumbnail}" /><figcaption>${articleEntry.title.replace(/_/g, ' ')}</figcaption></figure></a>\n`;
}

function getJSON<T>(url: string): Promise<T> {
  return axios.get<T>(url, { responseType: 'json' }).then((a) => a.data) as any;
}

export {
  isValidEmail,
  lcFirst,
  ucFirst,
  touch,
  getFullUrl,
  randomString,
  migrateChildren,
  getCreatorName,
  checkDependencies,
  doSeries,
  mkdirPromise,
  writeFilePromise,
  readFilePromise,
  execPromise,
  contains,
  getStringsForLang,
  _decodeURIComponent as decodeURIComponent,
  makeArticleListItem,
  makeArticleImageTile,
  getJSON,
};
