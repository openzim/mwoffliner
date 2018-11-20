import async from 'async';
import ci from 'case-insensitive';
import { exec, spawn } from 'child_process';
import domino from 'domino';
import homeDirExpander from 'expand-home-dir';
import fs from 'fs';
import mkdirp from 'mkdirp';
import pathParser from 'path';
import urlParser from 'url';

import { doSeries, mkdirPromise, execPromise } from './Utils';

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

  public createDirectories() {
    this.env.logger.log('Creating base directories...');
    const self = this;
    return new Promise((resolve, reject) => {
      async.series([ // TODO: convert to Promise (doSeries)
        (finished) => { mkdirp(self.outputDirectory, finished); },
        (finished) => { mkdirp(self.tmpDirectory, finished); },
      ], (error) => {
        if (error) {
          reject(`Unable to create mandatory directories : ${error}`);
        } else {
          resolve();
        }
      });
    });
  }

  /* Create directories for static files */
  public createSubDirectories() {
    const { env, config } = this;
    const { dirs } = config.output;
    env.logger.log(`Creating sub directories at "${env.htmlRootPath}"...`);
    return doSeries([
      () => execPromise(`rm -rf "${env.htmlRootPath}"`),
      () => mkdirPromise(env.htmlRootPath),
      () => mkdirPromise(env.htmlRootPath + dirs.style),
      () => mkdirPromise(`${env.htmlRootPath + dirs.style}/${dirs.styleModules}`),
      () => mkdirPromise(env.htmlRootPath + dirs.media),
      () => mkdirPromise(env.htmlRootPath + dirs.javascript),
      () => mkdirPromise(`${env.htmlRootPath + dirs.javascript}/${dirs.jsModules}`),
    ]);
  }

  public prepareCache() {
    const self = this;
    const { env } = self;
    return new Promise((resolve, reject) => {
      env.logger.log('Preparing cache...');
      this.cacheDirectory = `${this.cacheDirectory + env.computeFilenameRadical(true, true, true)}/`;
      this.redirectsCacheFile = `${this.cacheDirectory + env.computeFilenameRadical(false, true, true)}.redirects`;
      mkdirp(`${this.cacheDirectory}m/`, (err) => {
        if (err) {
          reject(err);
        } else {
          fs.writeFileSync(`${self.cacheDirectory}ref`, '42');
          resolve();
        }
      });
    });
  }

  public getSubTitle(this: Zim) {
    const { env } = this;
    return new Promise((resolve, reject) => {
      env.logger.log('Getting sub-title...');
      env.downloader.downloadContent(env.mw.webUrl, (content) => {
        const html = content.toString();
        const doc = domino.createDocument(html);
        const subTitleNode = doc.getElementById('siteSub');
        env.zim.subTitle = subTitleNode ? subTitleNode.innerHTML : '';
        resolve();
      });
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
    } else if (this.env.nopdf) {
      tags.push('nopdf');
    }
    /* nodet */
    if (this.env.nodet) { tags.push('nodet'); }
    /* Remove empty elements */
    tags = tags.filter((x) => (x !== (undefined || null || '')));
    return tags.join(';');
  }

  public executeTransparently(command, args, nostdout, nostderr) {
    const { logger } = this.env;
    return new Promise((resolve, reject) => {
      try {
        const proc = spawn(command, args).on('error', (error) => {
          if (error) {
            reject(`Error in executeTransparently(), ${error}`);
          }
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
          const isError = code !== 0;
          if (isError) {
            reject(`Error when executing ${command}`);
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(`Error when executing ${command}`);
      }
    });
  }

  public buildZIM() {
    const { env } = this;
    const zim = this;
    const { logger } = this.env;
    if (!env.nozim) {
      return new Promise((resolve, reject) => {
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
          ], !env.verbose, !env.verbose)
            .then(() => {
              logger.log(`ZIM file built at ${zimPath}`);
              /* Delete the html directory ? */
              if (env.keepHtml) {
                resolve();
              } else {
                execPromise(`rm -rf "${env.htmlRootPath}"`).then(resolve, reject);
              }
            })
            .catch((error) => {
              reject(`Failed to build successfuly the ZIM file ${zimPath} (${error})`);
            });
        }).on('error', (error) => { console.error(error); });
      });
    } else {
      return Promise.resolve();
    }
  }
}

export default Zim;
