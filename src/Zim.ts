import async from 'async';
import ci from 'case-insensitive';
import { exec, spawn } from 'child_process';
import domino from 'domino';
import homeDirExpander from 'expand-home-dir';
import fs from 'fs';
import mkdirp from 'mkdirp';
import pathParser from 'path';
import urlParser from 'url';

import U from './Utils';

class Zim {
  public config: any;
  public outputDirectory: string;
  public tmpDirectory: string;
  public env: any;
  public cacheDirectory: string;
  public redirectsCacheFile: string;
  public publisher: any;
  public tags: any;
  public langIso3: any;
  public mainPageId: any;
  public withZimFullTextIndex: any;
  public name: any;
  public description: any;
  public subTitle: any;
  public creator: any;
  public mobileLayout: boolean;
  public articleList: any;

  constructor(config, args) {
    this.config = config;
    Object.assign(this, args);
    // Normalize
    this.outputDirectory = this.outputDirectory ? `${homeDirExpander(this.outputDirectory)}/` : 'out/';
    this.tmpDirectory = this.tmpDirectory ? `${homeDirExpander(this.tmpDirectory)}/` : 'tmp/';
  }

  public createDirectories(cb) {
    this.env.logger.log('Creating base directories...');
    const self = this;
    async.series([
      (finished) => { mkdirp(self.outputDirectory, finished); },
      (finished) => { mkdirp(self.tmpDirectory, finished); },
    ], (error) => {
      U.exitIfError(error, `Unable to create mandatory directories : ${error}`);
      cb();
    });
  }

  /* Create directories for static files */
  public createSubDirectories(cb) {
    const { env, config } = this;
    const { dirs } = config.output;
    env.logger.log(`Creating sub directories at "${env.htmlRootPath}"...`);
    async.series([
      (finished) => exec(`rm -rf "${env.htmlRootPath}"`, finished),
      (finished) => fs.mkdir(env.htmlRootPath, undefined, finished),
      (finished) => fs.mkdir(env.htmlRootPath + dirs.style, undefined, finished),
      (finished) => fs.mkdir(`${env.htmlRootPath + dirs.style}/${dirs.styleModules}`, undefined, finished),
      (finished) => fs.mkdir(env.htmlRootPath + dirs.media, undefined, finished),
      (finished) => fs.mkdir(env.htmlRootPath + dirs.javascript, undefined, finished),
      (finished) => fs.mkdir(`${env.htmlRootPath + dirs.javascript}/${dirs.jsModules}`, undefined, finished),
    ], (error) => {
      U.exitIfError(error, `Unable to create mandatory directories : ${error}`);
      cb();
    });
  }

  public prepareCache(cb) {
    const { env } = this;
    const self = this;
    env.logger.log('Preparing cache...');
    this.cacheDirectory = `${this.cacheDirectory + env.computeFilenameRadical(true, true, true)}/`;
    this.redirectsCacheFile = `${this.cacheDirectory + env.computeFilenameRadical(false, true, true)}.redirects`;
    mkdirp(`${this.cacheDirectory}m/`, () => {
      fs.writeFileSync(`${self.cacheDirectory}ref`, '42');
      cb();
    });
  }

  public getSubTitle(cb) {
    const { env } = this;
    env.logger.log('Getting sub-title...');
    env.downloader.downloadContent(env.mw.webUrl, (content) => {
      const html = content.toString();
      const doc = domino.createDocument(html);
      const subTitleNode = doc.getElementById('siteSub');
      env.zim.subTitle = subTitleNode ? subTitleNode.innerHTML : '';
      cb();
    });
  }

  public computeZimRootPath() {
    let zimRootPath = this.outputDirectory[0] === '/' ? this.outputDirectory : `${pathParser.resolve(process.cwd(), this.outputDirectory)}/`;
    zimRootPath += `${this.env.computeFilenameRadical()}.zim`;
    return zimRootPath;
  }

  public computeZimName() {
    return (this.publisher ? `${this.publisher.toLowerCase()}.` : '') + this.env.computeFilenameRadical(false, true, true);
  }

  public computeZimTags() {
    let tags = this.tags.split(';');
    /* Mediawiki hostname radical */
    const mwUrlHostParts = urlParser.parse(this.env.mw.base).host.split('.');
    const mwUrlHostPartsTag = mwUrlHostParts.length > 1
      ? mwUrlHostParts[mwUrlHostParts.length - 2]
      : mwUrlHostParts[mwUrlHostParts.length - 1];
    if (ci(tags).indexOf(mwUrlHostPartsTag.toLowerCase()) === -1) {
      tags.push(mwUrlHostPartsTag.toLowerCase());
    }
    /* novid/nopic */
    if (this.env.nopic) {
      tags.push('nopic');
    } else if (this.env.novid) {
      tags.push('novid');
    }
    /* nodet */
    if (this.env.nodet) { tags.push('nodet'); }
    /* Remove empty elements */
    tags = tags.filter((x) => (x !== (undefined || null || '')));
    return tags.join(';');
  }

  public executeTransparently(command, args, callback, nostdout, nostderr) {
    const { logger } = this.env;
    try {
      const proc = spawn(command, args).on('error', (error) => {
        U.exitIfError(error, `Error in executeTransparently(), ${error}`);
      });
      if (!nostdout) {
        proc.stdout.on('data', (data) => {
          logger.log(data.toString().replace(/[\n\r]/g, ''));
        })
          .on('error', (error) => {
            console.error(`STDOUT output error: ${error}`);
          });
      }
      if (!nostderr) {
        proc.stderr.on('data', (data) => {
          console.error(data.toString().replace(/[\n\r]/g, ''));
        })
          .on('error', (error) => {
            console.error(`STDERR output error: ${error}`);
          });
      }
      proc.on('close', (code) => {
        callback(code !== 0 ? `Error when executing ${command}` : undefined);
      });
    } catch (error) {
      callback(`Error when executing ${command}`);
    }
  }

  public buildZIM(cb) {
    const { env } = this;
    const zim = this;
    const { logger } = this.env;
    if (!env.nozim) {
      exec('sync', () => {
        const zimPath = zim.computeZimRootPath();
        const zimTags = zim.computeZimTags();
        const cmd = `zimwriterfs --welcome=index.htm --favicon=favicon.png --language=${zim.langIso3}${zim.mainPageId ? ` --welcome=${env.getArticleBase(zim.mainPageId)}` : ' --welcome=index.htm'}${env.deflateTmpHtml ? ' --inflateHtml ' : ''}${env.verbose ? ' --verbose ' : ''}${zimTags ? ` --tags="${zimTags}"` : ''} --name="${zim.computeZimName()}"${zim.withZimFullTextIndex ? ' --withFullTextIndex' : ''}${env.writeHtmlRedirects ? '' : ` --redirects="${zim.redirectsCacheFile}"`} --title="${zim.name}" --description="${zim.description || zim.subTitle || zim.name}" --creator="${zim.creator}" --publisher="${zim.publisher}" "${env.htmlRootPath}" "${zimPath}"`;
        logger.log(`Building ZIM file ${zimPath} (${cmd})...`);
        logger.log(`RAID: ${zim.computeZimName()}`);
        zim.executeTransparently('zimwriterfs', [
          env.deflateTmpHtml ? '--inflateHtml' : '',
          env.verbose ? '--verbose' : '',
          env.writeHtmlRedirects ? '' : `--redirects=${zim.redirectsCacheFile}`,
          zim.withZimFullTextIndex ? '--withFullTextIndex' : '',
          zimTags ? `--tags=${zimTags}` : '',
          zim.mainPageId ? `--welcome=${env.getArticleBase(zim.mainPageId)}` : '--welcome=index.htm',
          '--favicon=favicon.png',
          `--language=${zim.langIso3}`,
          `--title=${zim.name}`,
          `--name=${zim.computeZimName()}`,
          `--description=${zim.description || zim.subTitle || zim.name}`,
          `--creator=${zim.creator}`,
          `--publisher=${zim.publisher}`,
          env.htmlRootPath,
          zimPath,
        ], (error) => {
          U.exitIfError(error, `Failed to build successfuly the ZIM file ${zimPath} (${error})`);
          logger.log(`ZIM file built at ${zimPath}`);
          /* Delete the html directory ? */
          if (env.keepHtml) {
            cb();
          } else {
            exec(`rm -rf "${env.htmlRootPath}"`, cb);
          }
        }, !env.verbose, !env.verbose);
      }).on('error', (error) => { console.error(error); });
    } else {
      cb();
    }
  }
}

export default Zim;
