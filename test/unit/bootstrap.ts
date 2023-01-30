// tslint:disable-next-line: no-reference
/// <reference path="../../src/types.d.ts" />

import 'dotenv/config'
import RedisStore from '../../src/RedisStore'
import { config } from '../../src/config'

export const redisStore = new RedisStore(process.env.REDIS || config.defaults.redisPath, { quitOnError: false })

export const startRedis = async () => {
  await redisStore.connect()
  const { articleDetailXId, redirectsXId, filesToDownloadXPath, filesToRetryXPath } = redisStore
  await Promise.all([articleDetailXId.flush(), redirectsXId.flush(), filesToDownloadXPath.flush(), filesToRetryXPath.flush()])
}

export const stopRedis = async () => {
  console.info('Closing all redis connections')
  redisStore.close()
}
