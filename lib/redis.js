import redis from 'redis';
import * as async from 'async';
import U from './Utils';

class Redis {
  constructor(env, argv, config) {
    this.env = env;
    this.redisClient = redis.createClient(argv.redis || config.defaults.redisConfig);
    const redisNamePrefix = new Date().getTime();
    this.redisRedirectsDatabase = `${redisNamePrefix}r`;
    this.redisMediaIdsDatabase = `${redisNamePrefix}m`;
    this.redisArticleDetailsDatabase = `${redisNamePrefix}d`;
    this.redisModuleDatabase = `${redisNamePrefix}mod`;
    this.redisCachedMediaToCheckDatabase = `${redisNamePrefix}c`;
  }

  quit() {
    this.env.logger.log('Quitting redis databases...');
    this.redisClient.quit();
  }

  flushDBs(finished) {
    const { logger } = this.env;
    this.redisClient.del(
      this.redisRedirectsDatabase,
      this.redisMediaIdsDatabase,
      this.redisArticleDetailsDatabase,
      this.redisCachedMediaToCheckDatabase,
      () => {
        logger.log('Redis databases flushed.');
        finished();
      },
    );
  }

  /* ------------ Redirect methods -------------- */
  getRedirect(redirectId, finished, cb) {
    this.redisClient.hget(this.redisRedirectsDatabase, redirectId, (error, target) => {
      U.exitIfError(error, `Unable to get a redirect target from redis: ${error}`);
      if (target) {
        cb(target);
      } else {
        finished();
      }
    });
  }

  saveRedirects(numRedirects, redirects, finished) {
    if (numRedirects > 0) {
      this.redisClient.hmset(this.redisRedirectsDatabase, redirects, (error) => {
        U.exitIfError(error, `Unable to set redirects: ${error}`);
        finished();
      });
    } else {
      finished();
    }
  }

  processAllRedirects(speed, keyProcessor, errorMsg, successMsg, finished) {
    const { logger } = this.env;
    this.redisClient.hkeys(this.redisRedirectsDatabase, (error, keys) => {
      U.exitIfError(error, `Unable to get redirect keys from redis: ${error}`);
      async.eachLimit(keys, speed, keyProcessor, (err) => {
        U.exitIfError(err, `${errorMsg}: ${err}`);
        logger.log(successMsg);
        finished();
      });
    });
  }

  processRedirectIfExists(targetId, processor) {
    try {
      this.redisClient.hexists(this.redisRedirectsDatabase, targetId, (error, res) => {
        U.exitIfError(error, `Unable to check redirect existence with redis: ${error}`);
        processor(res);
      });
    } catch (error) {
      U.exitIfError(true, `Exception by requesting redis ${error}`);
    }
  }

  /* ------------ Article methods -------------- */
  getArticle(articleId, cb) {
    this.redisClient.hget(this.redisArticleDetailsDatabase, articleId, cb);
  }

  saveArticles(articles) {
    if (Object.keys(articles).length) {
      this.redisClient.hmset(this.redisArticleDetailsDatabase, articles, (error) => {
        U.exitIfError(error, `Unable to save article detail information to redis: ${error}`);
      });
    }
  }

  /* ------------ Module methods -------------- */
  saveModuleIfNotExists(dump, module, moduleUri, type) {
    const self = this;
    return new Promise((resolve, reject) => {
      // hsetnx() store in redis only if key doesn't already exists
      self.redisClient.hsetnx(self.redisModuleDatabase, `${dump}_${module}.${type}`, moduleUri, (err, res) => (err ? reject(new Error(`unable to save module ${module} in redis`)) : resolve(res)));
    });
  }

  /* ------------ Media methods -------------- */
  getMedia(fileName, cb) {
    this.redisClient.hget(this.redisMediaIdsDatabase, fileName, cb);
  }

  saveMedia(fileName, width, cb) {
    this.redisClient.hset(this.redisMediaIdsDatabase, fileName, width, (error) => {
      U.exitIfError(error, `Unable to set redis entry for file to download ${fileName}: ${error}`);
      cb();
    });
  }

  deleteOrCacheMedia(del, width, fileName) {
    if (del) {
      this.redisClient.hdel(this.redisCachedMediaToCheckDatabase, fileName);
    } else {
      this.redisClient.hset(this.redisCachedMediaToCheckDatabase, fileName, width, (error) => {
        U.exitIfError(error, `Unable to set redis cache media to check ${fileName}: ${error}`);
      });
    }
  }

  delMediaDB(finished) {
    this.env.logger.log('Dumping finished with success.');
    this.redisClient.del(this.redisMediaIdsDatabase, finished);
  }
}

export default Redis;
