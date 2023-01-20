import { RedisKvs } from './util/RedisKvs.js'
import { RedisClient } from 'redis'

export function populateFilesToDownload(redisClient: RedisClient) {
  filesToDownloadXPath = new RedisKvs(redisClient, `${Date.now()}-media`, {
    u: 'url',
    n: 'namespace',
    m: 'mult',
    w: 'width',
  })
}

export let filesToDownloadXPath: RedisKvs<{ url: string; namespace?: string; mult?: number; width?: number }>

export function populateFilesToRetry(redisClient: RedisClient) {
  filesToRetryXPath = new RedisKvs(redisClient, `${Date.now()}-media-retry`, {
    u: 'url',
    n: 'namespace',
    m: 'mult',
    w: 'width',
  })
}

export let filesToRetryXPath: RedisKvs<{ url: string; namespace?: string; mult?: number; width?: number }>

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
  })
}

export let articleDetailXId: RedisKvs<ArticleDetail>

export function populateRedirects(redisClient: RedisClient) {
  redirectsXId = new RedisKvs(redisClient, `${Date.now()}-redirect`, {
    t: 'targetId',
    n: 'title',
  })
}

export let redirectsXId: RedisKvs<{ targetId: string; title: string }>
