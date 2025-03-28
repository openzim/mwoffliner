import { createClient } from 'redis'
import type { RedisClientType } from 'redis'
import RedisKvs from './util/RedisKvs.js'
import * as logger from './Logger.js'

class RedisStore implements RS {
  private static instance: RedisStore

  #client: RedisClientType
  #storesReady: boolean
  #filesToDownloadXPath: RKVS<FileDetail>
  #filesToRetryXPath: RKVS<FileDetail>
  #articleDetailXId: RKVS<ArticleDetail>
  #redirectsXId: RKVS<ArticleRedirect>

  public get client() {
    return this.#client
  }

  public get filesToDownloadXPath(): RKVS<FileDetail> {
    return this.#filesToDownloadXPath
  }

  public get filesToRetryXPath(): RKVS<FileDetail> {
    return this.#filesToRetryXPath
  }

  public get articleDetailXId(): RKVS<ArticleDetail> {
    return this.#articleDetailXId
  }

  public get redirectsXId(): RKVS<ArticleRedirect> {
    return this.#redirectsXId
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
      await Promise.all([this.#filesToDownloadXPath.flush(), this.#filesToRetryXPath.flush(), this.#articleDetailXId.flush(), this.#redirectsXId.flush()])
    }
    if (this.#client.isOpen) {
      await this.#client.quit()
    }
  }

  public async checkForExistingStores() {
    const patterns = ['*-media', '*-media-retry', '*-detail', '*-redirect']
    let keys: string[] = []
    for (const pattern of patterns) {
      keys = keys.concat(await this.#client.keys(pattern))
    }

    keys.forEach(async (key) => {
      try {
        const length = await this.#client.hLen(key)
        const time = new Date(Number(key.slice(0, key.indexOf('-'))))
        logger.error(`Found store from previous run from ${time} that is still in redis: ${key} with length ${length}`)
      } catch {
        logger.error(`Key ${key} exists in DB, and is no hash.`)
      }
    })
  }

  private async populateStores() {
    this.#filesToDownloadXPath = new RedisKvs(this.#client, `${Date.now()}-media`, {
      u: 'url',
      m: 'mult',
      w: 'width',
    })
    this.#filesToRetryXPath = new RedisKvs(this.#client, `${Date.now()}-media-retry`, {
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
      t: 'targetId',
      n: 'title',
    })
  }

  public createRedisKvs(...args: [string, KVS<string>?]): RKVS<any> {
    return new RedisKvs(this.#client, ...args)
  }
}

const rs = RedisStore.getInstance()
export default rs as RedisStore
