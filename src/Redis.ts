import redis from 'redis';

class Redis {
  public client: any;
  constructor(argv: any, config: any) {
    this.client = redis.createClient(argv.redis || config.defaults.redisConfig);
  }
}

export default Redis;
