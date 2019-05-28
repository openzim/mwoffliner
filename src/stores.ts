import { RedisKvs } from './util/redis-kvs';
import { RedisClient } from 'redis';

export function populateFilesToDownload(redisClient: RedisClient) {
    filesToDownloadXPath = new RedisKvs(redisClient, `${Date.now()}-media`);
}

export let filesToDownloadXPath: RedisKvs<{ url: string, namespace: string, mult?: number, width?: number }>;

export function populateFilesToRetry(redisClient: RedisClient) {
    filesToRetryXPath = new RedisKvs(redisClient, `${Date.now()}-media-retry`);
}

export let filesToRetryXPath: RedisKvs<{ url: string, namespace: string, mult?: number, width?: number }>;

export function populateArticleDetail(redisClient: RedisClient) {
    articleDetailXId = new RedisKvs(redisClient, `${Date.now()}-detail`);
}

export let articleDetailXId: RedisKvs<ArticleDetail>;

export function populateRedirects(redisClient: RedisClient) {
    redirectsXId = new RedisKvs(redisClient, `${Date.now()}-redirects`);
}

export let redirectsXId: RedisKvs<number>;

export function populateRequestCache(redisClient: RedisClient) {
    requestCacheXUrl = new RedisKvs(redisClient, `${Date.now()}-request`);
}

export let requestCacheXUrl: RedisKvs<any>;

export const scrapeStatus = {
    files: {
        success: 0,
        fail: 0,
    },
    articles: {
        success: 0,
        fail: 0,
    },
    redirects: {
        written: 0,
    },
};
