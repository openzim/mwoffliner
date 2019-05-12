import redis from 'redis';

class Redis {
  public redisClient: any;
  constructor(argv: any, config: any) {
    this.redisClient = redis.createClient(argv.redis || config.defaults.redisConfig);
  }
}

export default Redis;
