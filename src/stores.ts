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
    articleDetailXId = new RedisKvs(redisClient, `${Date.now()}-detail`, {
        s: 'subCategories',
        c: 'categories',
        p: 'pages',
        h: 'thumbnail',
        g: 'coordinates',
        t: 'timestamp',
        r: 'revisionId',
        i: 'internalThumbnailUrl',
        m: 'missing',
        n: 'title',
    });
}

export let articleDetailXId: RedisKvs<ArticleDetail>;

export function populateRedirects(redisClient: RedisClient) {
    redirectsXId = new RedisKvs(redisClient, `${Date.now()}-redirect`, {
        t: 'targetId',
        n: 'title',
    });
}

export let redirectsXId: RedisKvs<{ targetId: string, title: string }>;

export function populateRequestCache(redisClient: RedisClient) {
    requestCacheXUrl = new RedisKvs(redisClient, `${Date.now()}-request`);
}

export let requestCacheXUrl: RedisKvs<any>;
