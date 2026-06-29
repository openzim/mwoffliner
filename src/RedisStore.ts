import { createClient } from 'redis'
import type { RedisClientType } from 'redis'
import RedisKvs from './util/RedisKvs.js'
import * as logger from './Logger.js'
import RedisQueue from './util/RedisQueue.js'

class RedisStore implements RS {
  private static instance: RedisStore

  #client: RedisClientType
  #storesReady: boolean
  #filesStore: RKVS<FileDetail>
  #pagesStore: RKVS<PageDetail>
  #redirectsStore: RKVS<PageRedirect>
  #filesQueues: RedisQueue<FileToDownload>[]

  private constructor() {
    this.#filesQueues = []
  }

  public get client() {
    return this.#client
  }

  public get filesStore(): RKVS<FileDetail> {
    return this.#filesStore
  }

  public get pagesStore(): RKVS<PageDetail> {
    return this.#pagesStore
  }

  public get redirectsStore(): RKVS<PageRedirect> {
    return this.#redirectsStore
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
      logger.info('Flushing Redis DBs')
      await Promise.all([this.#filesStore.flush(), this.#pagesStore.flush(), this.#redirectsStore.flush(), ...this.#filesQueues.map((queue) => queue.flush())])
    }
    if (this.#client.isOpen) {
      await this.#client.quit()
    }
  }

  public async checkForExistingStores() {
    const patterns = ['*-media', '*-detail', '*-redirect', '*-files']
    let keys: string[] = []
    for (const pattern of patterns) {
      keys = keys.concat(await this.#client.keys(pattern))
    }

    await Promise.all(
      keys.map(async (key) => {
        try {
          const time = new Date(Number(key.slice(0, key.indexOf('-'))))
          logger.warn(`Deleting store from previous run from ${time} that was still in Redis: ${key}`)
          await this.#client.del(key)
        } catch (err) {
          logger.error(`Failed to delete stale key ${key}:`, err)
        }
      }),
    )
  }

  private async populateStores() {
    this.#filesStore = new RedisKvs(this.#client, `${Date.now()}-media`, {
      u: 'url',
      m: 'mult',
      w: 'width',
      k: 'kind',
    })
    this.#pagesStore = new RedisKvs(this.#client, `${Date.now()}-detail`, {
      p: 'pages',
      h: 'thumbnail',
      g: 'coordinates',
      t: 'timestamp',
      r: 'revisionId',
      i: 'internalThumbnailUrl',
      m: 'missing',
      n: 'title',
    })
    this.#redirectsStore = new RedisKvs(this.#client, `${Date.now()}-redirect`, {
      f: 'fragment',
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
