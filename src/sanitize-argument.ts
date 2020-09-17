import os from 'os';
import S3 from './S3';
import axios from 'axios';
import Redis from './Redis';
import urlParser from 'url';
import logger from './Logger';
import { config } from './config';
import fs, { readFileSync } from 'fs';
import * as QueryStringParser from 'querystring';
import { isValidEmail } from './util';

export async function sanitize_all(argv: any) {
  // extracting all arguments
  const {
    speed: _speed,
    adminEmail,
    mwUrl,
    customZimFavicon,
    optimisationCacheUrl,
    customMainPage,
    mwWikiPath,
  } = argv;

  const cpuCount = os.cpus().length;

  // sanitizing speed
  sanitize_speed(_speed);

  // sanitizing s3
  try {
    if (optimisationCacheUrl) {
      // Decompose the url with path and other S3 creds
      const s3UrlObj = urlParser.parse(optimisationCacheUrl);
      const queryReader = QueryStringParser.parse(s3UrlObj.query);
      const s3Url = (s3UrlObj.host || '') + (s3UrlObj.pathname || '');
      this.s3Obj = new S3(s3Url, queryReader);
      await this.s3Obj.initialise().then(() => {
        logger.log('Successfully logged in S3');
      });
    }
  } catch (err) {
    throw err;
  }

  // sanitize custom main page
  if (customMainPage) {
    const mainPageUrl = new URL(`${mwUrl}/${mwWikiPath?mwWikiPath:'wiki/'}${customMainPage}`)
    await sanitize_customMainPage(mainPageUrl).catch((err)=>{
      throw err;
    })
  }

  // sanitizing mwUrl
  await sanitize_mwUrl(mwUrl).catch((err)=>{
    throw err;
  });

  // sanitizing adminEmail
  sanitize_adminEmail(adminEmail);

  // redis client sanitization
  // created a redis client and then closed it.
  sanitize_redis(argv);

  // sanitizing custom zim favicon
  if (customZimFavicon) {
    await sanitize_customZimFavicon(customZimFavicon)
    .catch((err) => {
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
    .catch((err) => {
      throw new Error(`mwUrl [${mwUrl}] is not valid.`)
    })
}

export async function sanitize_customMainPage(mainPageUrl:URL)
{
  if (mainPageUrl.href.slice(0,5) === 'https') {
    mainPageUrl.href = mainPageUrl.href.slice(0,4)+mainPageUrl.href.slice(5)
  }
  await axios(
    {
      maxRedirects : 0,
      method : 'get',
      url : mainPageUrl.href,
    }
  )
  .catch((err) => {
    if (err.message === 'Request failed with status code 301' || err.message === 'Request failed with status code 302') {
      throw new Error('custom main page article has redirects');
    } else {
      throw err;
    }
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