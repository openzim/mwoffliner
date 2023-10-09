// tslint:disable-next-line: no-reference
/// <reference path="../../src/types.d.ts" />

import 'dotenv/config'
import RedisStore from '../../src/RedisStore.js'
import { config } from '../../src/config.js'

RedisStore.setOptions(process.env.REDIS || config.defaults.redisPath, { quitOnError: false })

export const startRedis = async () => {
  await RedisStore.connect()
  const { articleDetailXId, redirectsXId, filesToDownloadXPath, filesToRetryXPath } = RedisStore
  await Promise.all([articleDetailXId.flush(), redirectsXId.flush(), filesToDownloadXPath.flush(), filesToRetryXPath.flush()])
}

export const stopRedis = async () => {
  console.info('Closing all redis connections')
  RedisStore.close()
}
