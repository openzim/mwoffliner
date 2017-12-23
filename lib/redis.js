'use strict';

const redis = require('redis');
const async = require('async');
const U = require('./Utils.js').Utils;

function Redis(env, argv, config) {
  this.env = env;
  this.redisClient = redis.createClient(argv.redis || config.defaults.redisConfig);

  const redisNamePrefix = new Date().getTime();
  this.redisRedirectsDatabase = redisNamePrefix + 'r';
  this.redisMediaIdsDatabase = redisNamePrefix + 'm';
  this.redisArticleDetailsDatabase = redisNamePrefix + 'd';
  this.redisModuleDatabase = redisNamePrefix + 'mod';
  this.redisCachedMediaToCheckDatabase = redisNamePrefix + 'c';
}

Redis.prototype.quit = function() {
  this.env.logger.log('Quitting redis databases...');
  this.redisClient.quit();
};

Redis.prototype.flushDBs = function(finished) {
  var logger = this.env.logger;
  this.redisClient.del(
    this.redisRedirectsDatabase,
    this.redisMediaIdsDatabase,
    this.redisArticleDetailsDatabase,
    this.redisCachedMediaToCheckDatabase,
    () => {
      logger.log('Redis databases flushed.');
      finished();
    }
  );
};

/* ------------ Redirect methods -------------- */
Redis.prototype.getRedirect = function(redirectId, finished, cb) {
  this.redisClient.hget(this.redisRedirectsDatabase, redirectId, function(error, target) {
      U.exitIfError(error, `Unable to get a redirect target from redis: ${error}`);
      if (target) {
        cb(target);
      } else {
        finished();
      }
  });
};

Redis.prototype.saveRedirects = function(numRedirects, redirects, finished) {
  if (numRedirects > 0) {
    this.redisClient.hmset(this.redisRedirectsDatabase, redirects, function(error) {
      U.exitIfError(error, `Unable to set redirects: ${error}`);
      finished();
    });
  } else {
    finished();
  }
};

Redis.prototype.processAllRedirects = function(speed, keyProcessor, errorMsg, successMsg, finished) {
  var logger = this.env.logger;
  this.redisClient.hkeys(this.redisRedirectsDatabase, function(error, keys) {
      U.exitIfError(error, `Unable to get redirect keys from redis: ${error}`);
      async.eachLimit(keys, speed, keyProcessor, function(error) {
        U.exitIfError(error, `${errorMsg}: ${error}`);
        logger.log(successMsg);
        finished();
      });
  });
};

Redis.prototype.processRedirectIfExists = function(targetId, processor) {
  try {
    this.redisClient.hexists(this.redisRedirectsDatabase, targetId, function(error, res) {
      U.exitIfError(error, `Unable to check redirect existence with redis: ${error}`);
      processor(res);
    });
  } catch (error) {
    console.error(`Exception by requesting redis ${error}`);
    process.exit(1);
  }
};

/* ------------ Article methods -------------- */
Redis.prototype.getArticle = function(articleId, cb) {
  this.redisClient.hget(this.redisArticleDetailsDatabase, articleId, cb);
};

Redis.prototype.saveArticles = function(articles) {
  if (Object.keys(articles).length) {
    this.redisClient.hmset(this.redisArticleDetailsDatabase, articles, function(error) {
      U.exitIfError(error, `Unable to save article detail information to redis: ${error}`);
    });
  }
};

/* ------------ Module methods -------------- */
Redis.prototype.saveModuleIfNotExists = function(dump, module, moduleUri, type) {
  var self = this;
  return new Promise((resolve, reject) => {
    // hsetnx() store in redis only if key doesn't already exists
    self.redisClient.hsetnx(
      self.redisModuleDatabase,
      `${dump}_${module}.${type}`,
      moduleUri,
      (err, res) => (err ? reject(`Error: unable to save module ${module} in redis`) : resolve(res))
    );
  });
};

/* ------------ Media methods -------------- */
Redis.prototype.getMedia = function(fileName, cb) {
  this.redisClient.hget(this.redisMediaIdsDatabase, fileName, cb);
};

Redis.prototype.saveMedia = function(fileName, width, cb) {
  this.redisClient.hset(this.redisMediaIdsDatabase, fileName, width, function(error) {
    U.exitIfError(error, `Unable to set redis entry for file to download ${fileName}: ${error}`);
    cb();
  });
};

Redis.prototype.deleteOrCacheMedia = function(del, width, fileName) {
  if (del) {
    this.redisClient.hdel(this.redisCachedMediaToCheckDatabase, fileName);
  } else {
    this.redisClient.hset(this.redisCachedMediaToCheckDatabase, fileName, width, function(error) {
      U.exitIfError(error, `Unable to set redis cache media to check ${fileName}: ${error}`);
    });
  }
};

Redis.prototype.delMediaDB = function(finished) {
  this.env.logger.log('Dumping finished with success.');
  this.redisClient.del(this.redisMediaIdsDatabase, finished);
};

module.exports = {
    Redis: Redis
};
