// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../src/types.d.ts" />

import 'dotenv/config'
import RedisStore from '../../src/RedisStore.js'
import { config } from '../../src/config.js'

RedisStore.setOptions(process.env.REDIS || config.defaults.redisPath, { quitOnError: false })

export const startRedis = async () => {
  await RedisStore.connect()
  const { articleDetailXId, redirectsXId, filesToDownloadXPath, filesQueues } = RedisStore
  await Promise.all([articleDetailXId.flush(), redirectsXId.flush(), filesToDownloadXPath.flush(), ...filesQueues.map((queue) => queue.flush)])
}

export const stopRedis = async () => {
  console.info('Closing all redis connections')
  await RedisStore.close()
}
