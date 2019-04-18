import { RedisKvs } from './util/redis-kvs';
import { RedisClient } from 'redis';

export function populateFilesToDownload(redisClient: RedisClient) {
    filesToDownloadXPath = new RedisKvs(redisClient, `${Date.now()}-media`);
}

export let filesToDownloadXPath: RedisKvs<{ url: string, namespace: string, mult?: number, width?: number }>;
