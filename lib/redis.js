"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var async = __importStar(require("async"));
var redis_1 = __importDefault(require("redis"));
var Redis = /** @class */ (function () {
    function Redis(env, argv, config) {
        this.env = env;
        this.redisClient = redis_1.default.createClient(argv.redis || config.defaults.redisConfig);
        var redisNamePrefix = new Date().getTime();
        this.redisRedirectsDatabase = redisNamePrefix + "r";
        this.redisMediaIdsDatabase = redisNamePrefix + "m";
        this.redisArticleDetailsDatabase = redisNamePrefix + "d";
        this.redisModuleDatabase = redisNamePrefix + "mod";
        this.redisCachedMediaToCheckDatabase = redisNamePrefix + "c";
    }
    Redis.prototype.quit = function () {
        this.env.logger.log('Quitting redis databases...');
        this.redisClient.quit();
    };
    Redis.prototype.flushDBs = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var logger = _this.env.logger;
            _this.redisClient.del(_this.redisRedirectsDatabase, _this.redisMediaIdsDatabase, _this.redisArticleDetailsDatabase, _this.redisCachedMediaToCheckDatabase, function (err) {
                if (err) {
                    reject(err);
                }
                else {
                    logger.log('Redis databases flushed.');
                    resolve();
                }
            });
        });
    };
    /* ------------ Redirect methods -------------- */
    Redis.prototype.getRedirect = function (redirectId, finished, cb) {
        this.redisClient.hget(this.redisRedirectsDatabase, redirectId, function (error, target) {
            if (error) {
                cb({ message: "Unable to get a redirect target from redis", error: error });
            }
            else {
                if (target) {
                    cb(target);
                }
                else {
                    finished();
                }
            }
        });
    };
    Redis.prototype.saveRedirects = function (numRedirects, redirects, finished) {
        if (numRedirects > 0) {
            this.redisClient.hmset(this.redisRedirectsDatabase, redirects, function (error) {
                finished(error && { message: "Unable to set redirects", error: error });
            });
        }
        else {
            finished();
        }
    };
    Redis.prototype.processAllRedirects = function (speed, keyProcessor, errorMsg, successMsg) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var logger = _this.env.logger;
            _this.redisClient.hkeys(_this.redisRedirectsDatabase, function (error, keys) {
                if (error) {
                    reject("Unable to get redirect keys from redis: " + error);
                }
                else {
                    async.eachLimit(keys, speed, keyProcessor, function (err) {
                        if (err) {
                            reject(errorMsg + ": " + err);
                        }
                        else {
                            logger.log(successMsg);
                            resolve();
                        }
                    });
                }
            });
        });
    };
    Redis.prototype.processRedirectIfExists = function (targetId, processor) {
        try {
            this.redisClient.hexists(this.redisRedirectsDatabase, targetId, function (error, res) {
                if (error) {
                    throw new Error("Unable to check redirect existence with redis: " + error);
                }
                processor(res);
            });
        }
        catch (error) {
            throw new Error("Exception by requesting redis " + error);
        }
    };
    /* ------------ Article methods -------------- */
    Redis.prototype.getArticle = function (articleId, cb) {
        this.redisClient.hget(this.redisArticleDetailsDatabase, articleId, cb);
    };
    Redis.prototype.saveArticles = function (articles) {
        if (Object.keys(articles).length) {
            this.redisClient.hmset(this.redisArticleDetailsDatabase, articles, function (error) {
                if (error) {
                    throw new Error("Unable to save article detail information to redis: " + error);
                }
            });
        }
    };
    /* ------------ Module methods -------------- */
    Redis.prototype.saveModuleIfNotExists = function (dump, module, moduleUri, type) {
        var self = this;
        return new Promise(function (resolve, reject) {
            // hsetnx() store in redis only if key doesn't already exists
            self.redisClient.hsetnx(self.redisModuleDatabase, dump + "_" + module + "." + type, moduleUri, function (err, res) { return (err ? reject(new Error("unable to save module " + module + " in redis")) : resolve(res)); });
        });
    };
    /* ------------ Media methods -------------- */
    Redis.prototype.getMedia = function (fileName, cb) {
        this.redisClient.hget(this.redisMediaIdsDatabase, fileName, cb);
    };
    Redis.prototype.saveMedia = function (fileName, width, cb) {
        this.redisClient.hset(this.redisMediaIdsDatabase, fileName, width, function (error) {
            cb(error && { message: "Unable to set redis entry for file to download " + fileName, error: error });
        });
    };
    Redis.prototype.deleteOrCacheMedia = function (del, width, fileName) {
        if (del) {
            this.redisClient.hdel(this.redisCachedMediaToCheckDatabase, fileName);
        }
        else {
            this.redisClient.hset(this.redisCachedMediaToCheckDatabase, fileName, width, function (error) {
                if (error) {
                    throw new Error("Unable to set redis cache media to check " + fileName + ": " + error);
                }
            });
        }
    };
    Redis.prototype.delMediaDB = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.env.logger.log('Dumping finished with success.');
            _this.redisClient.del(_this.redisMediaIdsDatabase, function (err) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    };
    return Redis;
}());
exports.default = Redis;
