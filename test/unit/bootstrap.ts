// tslint:disable-next-line: no-reference
/// <reference path="../../src/types.d.ts" />

import Redis from '../../src/Redis'
import { config } from '../../src/config'
import { articleDetailXId, redirectsXId, filesToDownloadXPath, populateArticleDetail, populateRedirects, populateFilesToDownload } from '../../src/stores'

export const redis = new Redis({ redis: process.env.REDIS }, config)

export const startRedis = () => {
  populateArticleDetail(redis.client)
  populateRedirects(redis.client)
  populateFilesToDownload(redis.client)

  articleDetailXId.flush()
  redirectsXId.flush()
  filesToDownloadXPath.flush()
}

export const stopRedis = () => {
  console.info('Closing all redis connections')
  redis.client.quit()
}
