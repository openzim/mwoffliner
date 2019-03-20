import { RedisKvs } from './util/redis-kvs';
import { RedisClient } from 'redis';

export function populateArticleDetail(redisClient: RedisClient) {
    articleDetailXId = new RedisKvs(redisClient, `${Date.now()}-detail`);
}

export let articleDetailXId: RedisKvs<ArticleDetail>;
