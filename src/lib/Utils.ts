
import fs from 'fs';
import urlParser, { UrlWithStringQuery } from 'url';
import pathParser from 'path';

const Utils = {
  isValidEmail(email) {
    const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return emailRegex.test(email);
  },

  lcFirst(str) {
    str += '';
    const f = str.charAt(0).toLowerCase();
    return f + str.substr(1);
  },

  ucFirst(str) {
    str += '';
    const f = str.charAt(0).toUpperCase();
    return f + str.substr(1);
  },

  decodeURIComponent(uri) {
    try {
      return decodeURIComponent(uri);
    } catch (error) {
      console.error(error);
      return uri;
    }
  },

  touch(paths) {
    const currentDate = Date.now();
    paths = paths instanceof Array ? paths : [paths];
    paths.forEach((path) => {
      fs.utimes(path, currentDate, currentDate, () => { });
    });
  },

  getFullUrl(webUrlHost, url, baseUrl?) {
    const urlObject = urlParser.parse(url, false, true);
    if (!urlObject.protocol) {
      const baseUrlObject = baseUrl ? urlParser.parse(baseUrl, false, true) : <UrlWithStringQuery>{};
      urlObject.protocol = urlObject.protocol || baseUrlObject.protocol || 'http:';
      urlObject.host = urlObject.host || baseUrlObject.host || webUrlHost;

      /* Relative path */
      if (urlObject.pathname && urlObject.pathname.indexOf('/') !== 0 && baseUrlObject.pathname) {
        urlObject.pathname = `${pathParser.dirname(baseUrlObject.pathname)}/${urlObject.pathname}`;
      }

      url = urlParser.format(urlObject);
    }

    return url;
  },

  exitIfError(error, msg) {
    if (error) {
      console.error(msg, error);
      process.exit(1);
    }
  },

  randomString(len) {
    let str = '';
    const charSet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < len; i += 1) {
      const randomPoz = Math.floor(Math.random() * charSet.length);
      str += charSet.substring(randomPoz, randomPoz + 1);
    }
    return str;
  },

  /**
	 * Move 'from'.childNodes to 'to' adding them before 'beforeNode'
	 * If 'beforeNode' is null, the nodes are appended at the end.
	 */
  migrateChildren(from, to, beforeNode) {
    if (beforeNode === undefined) {
      beforeNode = null;
    }
    while (from.firstChild) {
      to.insertBefore(from.firstChild, beforeNode);
    }
  },
};

export default Utils;
