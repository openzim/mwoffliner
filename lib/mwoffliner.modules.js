require('./jsutils.js'); // we should avoid monkey-patching

const fs = require('fs');
const domino = require('domino');
// const jsdom = require('jsdom'); // never used
const async = require('async');
const http = require('follow-redirects').http;
const https = require('follow-redirects').https;
const zlib = require('zlib');
const swig = require('swig');
const urlParser = require('url');
const pathParser = require('path');
// const mkdirp = require('mkdirp'); // never used
const redis = require('redis');
// const childProcess = require('child_process'); // never used
const exec = require('child_process').exec;
const os = require('os');
const crypto = require('crypto');
const unicodeCutter = require('utf8-binary-cutter');
const htmlMinifier = require('html-minifier');
const parsoid = require('parsoid');
const fetch = require('node-fetch');

const config = require('./config.js').config;
const Downloader = require('./Downloader.js').Downloader;
const DU = require('./DOMUtils.js').DOMUtils;
const Logger = require('./Logger.js').Logger;
const MediaWiki = require('./MediaWiki.js').MediaWiki;
const U = require('./Utils.js').Utils;
const Zim = require('./Zim.js').Zim;

const OfflinerEnv = require('./OfflinerEnv.js').OfflinerEnv;

module.exports = {
  fs: fs,
  domino: domino,
  // jsdom: jsdom,
  async: async,
  http: http,
  https: https,
  zlib: zlib,
  swig: swig,
  urlParser: urlParser,
  pathParser: pathParser,
  // mkdirp: mkdirp,
  redis: redis,
  // childProcess: childProcess,
  exec: exec,
  os: os,
  crypto: crypto,
  unicodeCutter: unicodeCutter,
  htmlMinifier: htmlMinifier,
  parsoid: parsoid,
  fetch: fetch,
  config: config,
  Downloader: Downloader,
  DU: DU,
  Logger: Logger,
  MediaWiki: MediaWiki,
  U: U,
  Zim: Zim,
  OfflinerEnv: OfflinerEnv
};
