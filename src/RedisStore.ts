import { createClient } from 'redis'
import type { RedisClientType } from 'redis'
import RedisKvs from './util/RedisKvs.js'
import * as logger from './Logger.js'
import RedisQueue from './util/RedisQueue.js'
import RedisSet from './util/RedisSet.js'

class RedisStore implements RS {
  private static instance: RedisStore

  #client: RedisClientType
  #storesReady: boolean
  #filesToDownloadXPath: RKVS<FileDetail>
  #articleDetailXId: RKVS<ArticleDetail>
  #redirectsXId: RKVS<ArticleRedirect>
  #queuedFilePathsSet: RSET
  #filesQueues: RedisQueue<FileToDownload>[]

  private constructor() {
    this.#filesQueues = []
  }

  public get client() {
    return this.#client
  }

  public get filesToDownloadXPath(): RKVS<FileDetail> {
    return this.#filesToDownloadXPath
  }

  public get articleDetailXId(): RKVS<ArticleDetail> {
    return this.#articleDetailXId
  }

  public get redirectsXId(): RKVS<ArticleRedirect> {
    return this.#redirectsXId
  }

  public get queuedFilePathsSet(): RSET {
    return this.#queuedFilePathsSet
  }

  public get filesQueues(): RedisQueue<FileToDownload>[] {
    return this.#filesQueues
  }

  public static getInstance(): RedisStore {
    if (!RedisStore.instance) {
      RedisStore.instance = new RedisStore()
    }
    return RedisStore.instance
  }

  public setOptions(redisPath: string, opts?: any): void {
    if (RedisStore.instance) {
      const options = { ...opts }
      const quitOnError = !(options.quitOnError === false)
      delete options.quitOnError

      if (redisPath.startsWith('/') || redisPath.startsWith('./')) {
        options.socket = {
          ...options.socket,
          path: redisPath,
        }
      } else {
        options.url = redisPath
      }

      this.#client = createClient(options)

      this.#client.on('error', (err) => {
        if (quitOnError) {
          logger.error('Redis Client Error', err)
          process.exit(3)
        }
      })
    } else {
      throw new Error('Redis store has not been instantiated before setting options')
    }
  }

  public async connect(populateStores = true) {
    if (this.#client.isOpen) {
      return
    }
    await this.#client.connect()
    if (populateStores) {
      await this.checkForExistingStores()
      await this.populateStores()
      this.#storesReady = true
    }
  }

  public async close() {
    if (this.#client.isReady && this.#storesReady) {
      logger.log('Flushing Redis DBs')
      await Promise.all([
        this.#filesToDownloadXPath.flush(),
        this.#articleDetailXId.flush(),
        this.#redirectsXId.flush(),
        this.#queuedFilePathsSet.flush(),
        ...this.#filesQueues.map((queue) => queue.flush()),
      ])
    }
    if (this.#client.isOpen) {
      await this.#client.quit()
    }
  }

  public async checkForExistingStores() {
    const patterns = ['*-media', '*-detail', '*-redirect', '*-queued-paths', '*-files']
    let keys: string[] = []
    for (const pattern of patterns) {
      keys = keys.concat(await this.#client.keys(pattern))
    }

    for (const key of keys) {
      try {
        let length: number
        if (key.endsWith('-files')) {
          length = await this.#client.lLen(key)
        } else if (key.endsWith('-queued-paths')) {
          length = await this.#client.sCard(key)
        } else {
          length = await this.#client.hLen(key)
        }
        const firstDashIdx = key.indexOf('-')
        const maybeTimestamp = firstDashIdx > 0 ? Number(key.slice(0, firstDashIdx)) : Number.NaN
        if (Number.isFinite(maybeTimestamp)) {
          const time = new Date(maybeTimestamp)
          logger.warn(`Deleting store from previous run from ${time} that was still in Redis: ${key} with length ${length}`)
        } else {
          logger.warn(`Deleting store from previous run with non-timestamped key: ${key} with length ${length}`)
        }
        await this.#client.del(key)
      } catch {
        logger.error(`Key ${key} exists in DB, and is no hash.`)
      }
    }
  }

  private async populateStores() {
    this.#filesToDownloadXPath = new RedisKvs(this.#client, `${Date.now()}-media`, {
      u: 'url',
      m: 'mult',
      w: 'width',
    })
    this.#articleDetailXId = new RedisKvs(this.#client, `${Date.now()}-detail`, {
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
    this.#redirectsXId = new RedisKvs(this.#client, `${Date.now()}-redirect`, {
      f: 'fragment',
      t: 'targetId',
      n: 'title',
    })
    this.#queuedFilePathsSet = new RedisSet(this.#client, `${Date.now()}-queued-paths`)
  }

  public createRedisKvs(...args: [string, KVS<string>?]): RKVS<any> {
    return new RedisKvs(this.#client, ...args)
  }
}

const rs = RedisStore.getInstance()
export default rs as RedisStore
