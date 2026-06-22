// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../src/types.d.ts" />

import 'dotenv/config'
import RedisStore from '../../src/RedisStore.js'
import { config } from '../../src/config.js'
import FileManager from '../../src/util/FileManager.js'

RedisStore.setOptions(process.env.REDIS || config.defaults.redisPath, { quitOnError: false })

export const startRedis = async () => {
  await RedisStore.connect()
  const { pagesStore: pageDetailStore, redirectsStore: redirectsXId, filesStore: filesToDownloadXPath, filesQueues } = RedisStore
  await Promise.all([pageDetailStore.flush(), redirectsXId.flush(), filesToDownloadXPath.flush(), ...filesQueues.map((queue) => queue.flush())])
  FileManager.reset()
}

export const stopRedis = async () => {
  console.info('Closing all redis connections')
  await RedisStore.close()
}
