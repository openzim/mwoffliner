import * as async from 'async';
import redis from 'redis';
import logger from './Logger';

class Redis {
  public redisClient: any;
  public redisRedirectsDatabase: string;
  public redisMediaIdsDatabase: string;
  public redisArticleDetailsDatabase: string;
  public redisModuleDatabase: string;
  public redisCachedMediaToCheckDatabase: string;
  constructor(argv: any, config: any) {
    this.redisClient = redis.createClient(argv.redis || config.defaults.redisConfig);
    const redisNamePrefix = new Date().getTime();
    this.redisRedirectsDatabase = `${redisNamePrefix}r`;
    this.redisMediaIdsDatabase = `${redisNamePrefix}m`;
    this.redisArticleDetailsDatabase = `${redisNamePrefix}d`;
    this.redisModuleDatabase = `${redisNamePrefix}mod`;
    this.redisCachedMediaToCheckDatabase = `${redisNamePrefix}c`;
  }

  public quit() {
    logger.log('Quitting redis databases...');
    this.redisClient.quit();
  }

  public flushDBs() {
    return new Promise((resolve, reject) => {
      this.redisClient.del(
        this.redisRedirectsDatabase,
        this.redisMediaIdsDatabase,
        this.redisArticleDetailsDatabase,
        this.redisCachedMediaToCheckDatabase,
        (err: any) => {
          if (err) {
            reject(err);
          } else {
            logger.log('Redis databases flushed.');
            resolve();
          }
        });
    });
  }

  /* ------------ Redirect methods -------------- */
  public getRedirect(redirectId: string, finished: any, cb: any) {
    this.redisClient.hget(this.redisRedirectsDatabase, redirectId, (error: any, target: any) => {
      if (error) {
        cb({ message: `Unable to get a redirect target from redis`, error });
      } else {
        if (target) {
          cb(target);
        } else {
          finished();
        }
      }
    });
  }

  public saveRedirects(numRedirects: number, redirects: any, finished: any) {
    if (numRedirects > 0) {
      this.redisClient.hmset(this.redisRedirectsDatabase, redirects, (error: any) => {
        finished(error && { message: `Unable to set redirects`, error });
      });
    } else {
      finished();
    }
  }

  public processAllRedirects(speed: any, keyProcessor: any, errorMsg: any, successMsg: any) {
    return new Promise((resolve, reject) => {
      this.redisClient.hkeys(this.redisRedirectsDatabase, (error: any, keys: any) => {
        if (error) {
          reject(`Unable to get redirect keys from redis: ${error}`);
        } else {
          async.eachLimit(keys, speed, keyProcessor, (err) => {
            if (err) {
              logger.warn(`${errorMsg}: ${err}`);
              reject(`${errorMsg}: ${err}`);
            } else {
              logger.log(successMsg);
              resolve();
            }
          });
        }
      });
    });
  }

  public async processRedirectIfExists(targetId: any) {
    try {
      return new Promise((resolve, reject) => {
        this.redisClient.hexists(this.redisRedirectsDatabase, targetId, (error: any, res: any) => {
          if (error) {
            reject(`Unable to check redirect existence with redis: ${error}`);
          } else {
            resolve(res);
          }
        });
      });
    } catch (error) {
      throw new Error(`Exception by requesting redis ${error}`);
    }
  }

  /* ------------ Article methods -------------- */
  public getArticle(articleId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.redisClient.hget(this.redisArticleDetailsDatabase, articleId, (err: any, res: string) => {
        if (err) { reject(err); } else { resolve(res); }
      });
    });
  }

  public saveArticles(articles: string[]) {
    if (Object.keys(articles).length) {
      this.redisClient.hmset(this.redisArticleDetailsDatabase, articles, (error: any) => {
        if (error) {
          throw new Error(`Unable to save article detail information to redis: ${error}`);
        }
      });
    }
  }

  /* ------------ Module methods -------------- */
  public saveModuleIfNotExists(dump: any, module: any, moduleUri: any, type: any) {
    const self = this;
    return new Promise((resolve, reject) => {
      // hsetnx() store in redis only if key doesn't already exists
      self.redisClient.hsetnx(self.redisModuleDatabase, `${dump}_${module}.${type}`, moduleUri, (err: any, res: any) => (err ? reject(new Error(`unable to save module ${module} in redis`)) : resolve(res)));
    });
  }

  /* ------------ Media methods -------------- */
  public getMedia(fileName: any, cb: Callback) {
    this.redisClient.hget(this.redisMediaIdsDatabase, fileName, cb);
  }

  public saveMedia(fileName: any, width: any, cb: Callback) {
    this.redisClient.hset(this.redisMediaIdsDatabase, fileName, width, (error: any) => {
      cb(error && { message: `Unable to set redis entry for file to download ${fileName}`, error });
    });
  }

  public deleteOrCacheMedia(del: any, width: any, fileName: any) {
    if (del) {
      this.redisClient.hdel(this.redisCachedMediaToCheckDatabase, fileName);
    } else {
      this.redisClient.hset(this.redisCachedMediaToCheckDatabase, fileName, width, (error: any) => {
        if (error) {
          throw new Error(`Unable to set redis cache media to check ${fileName}: ${error}`);
        }
      });
    }
  }

  public delMediaDB() {
    return new Promise((resolve, reject) => {
      logger.log('Dumping finished with success.');
      this.redisClient.del(this.redisMediaIdsDatabase, (err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

export default Redis;
