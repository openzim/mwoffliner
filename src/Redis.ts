import redis from 'redis';
import logger from './Logger';

class Redis {
  public client: any;
  constructor(argv: any, config: any) {
    this.client = redis.createClient(argv.redis || config.defaults.redisConfig);

    this.client.on('error', function (err: Error) {
      logger.error(err.message);
      process.exit(1);
    });
  }
}

export default Redis;
