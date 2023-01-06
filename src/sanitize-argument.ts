import os from 'os';
import S3 from './S3.js';
import axios from 'axios';
import Redis from './Redis.js';
import urlParser from 'url';
import pathParser from 'path';
import logger from './Logger.js';
import { config } from './config.js';
import fs from 'fs';
import * as QueryStringParser from 'querystring';
import { isValidEmail, DEFAULT_WIKI_PATH } from './util/index.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function sanitize_all(argv: any) {

  // extracting all arguments
  const {
    speed: _speed,
    adminEmail,
    mwUrl,
    customZimFavicon,
    optimisationCacheUrl,
    mwWikiPath,
  } = argv;

  const cpuCount = os.cpus().length;

  // sanitizing speed
  sanitize_speed(_speed);

  // sanitizing custom flavour
  if (argv.customFlavour) {
    argv.customFlavour = sanitize_customFlavour(argv.customFlavour);
    if (!argv.customFlavour) {
      throw new Error('Custom Flavour not found');
    }
  }

  // sanitizing S3
  try {
    if (optimisationCacheUrl) {
      // Decompose the url with path and other S3 creds
      const s3UrlObj = urlParser.parse(optimisationCacheUrl);
      const queryReader = QueryStringParser.parse(s3UrlObj.query);
      const s3Url = (s3UrlObj.protocol || 'https:') + '//' + (s3UrlObj.host || '') + (s3UrlObj.pathname || '');
      this.s3Obj = new S3(s3Url, queryReader);
      await this.s3Obj.initialise().then(() => {
        logger.log('Successfully logged in S3');
      });
    }
  } catch (err) {
    throw err;
  }

  // sanitizing mwUrl
  await sanitize_mwUrl(mwUrl).catch((err)=>{
    throw err;
  });

  // sanitize Custom Main Page
  if (argv.customMainPage) {
    argv.customMainPage = argv.customMainPage.replace(/ /g,'_');
  }

  // sanitizing adminEmail
  sanitize_adminEmail(adminEmail);

  // Redis client sanitization
  // created a redis client and then closed it.
  sanitize_redis(argv);

  // sanitizing custom zim favicon
  if (customZimFavicon) {
    await sanitize_customZimFavicon(customZimFavicon)
    .catch(err=>{
      throw err;
    });
  }
}

export function sanitize_speed(_speed:any)
{
  if (_speed && isNaN(_speed)) {
    throw new Error(
      `speed is not a number, please give a number value to --speed.`
    );
  }
}

export async function sanitize_mwUrl(mwUrl:string)
{
    await axios
    .get(mwUrl)
    .catch((err)=>{
      throw new Error(`mwUrl [${mwUrl}] is not valid.`)
    })
}

export function sanitize_adminEmail(adminEmail:any)
{
  if (!isValidEmail(adminEmail)) {
    throw new Error(`Admin email [${adminEmail}] is not valid.`);
  }
}

export function sanitize_redis(argv:any)
{
  try {
    const sanitize_redis = new Redis(argv, config);
    logger.log('closing sanitize redis DB');
    sanitize_redis.client.quit();
  } catch (err) {
    throw err;
  }
}

export async function sanitize_customZimFavicon(customZimFavicon:any)
{
  const faviconIsRemote = customZimFavicon.includes('http');
    if (faviconIsRemote) {
      // make a download to check custom favicon link is valid
      await axios
        .get(customZimFavicon)
        .catch((err) => {
          throw new Error(
            `Failed to download custom zim favicon from [${customZimFavicon}]`
          );
        });
    } else {
      try {
        fs.readFileSync(customZimFavicon);
      } catch (err) {
        throw err;
      }
    }
}

/**
 * Search for the customFlavour in the following order
 *
 * 1. Current directory in which command has been run
 * 2. mwoffliner's extensions directory
 * 3. absolute path(for root folder)
 *
 * Note: CustomFlavour doesn't necessarily need be given with extension(.js)
 * like --customFlavour=wiktionary_fr. Hence, .js is explicitly added for
 * path resolution.
 */

export function sanitize_customFlavour(customFlavour: string): string {
  customFlavour += pathParser.extname(customFlavour) !== '.js' ? '.js' : '';
  return [
      pathParser.resolve(customFlavour),
      pathParser.resolve(__dirname, `../extensions/${customFlavour}`),
      customFlavour,
  ].find(function(possiblePath) {
    return fs.existsSync(possiblePath)
  }) || null;
}