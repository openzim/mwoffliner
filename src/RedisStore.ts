import { createClient } from 'redis'
import type { RedisClientType } from 'redis'
import RedisKvs from './util/RedisKvs.js'
import * as logger from './Logger.js'

class RedisStore implements RS {
  private readonly _client: RedisClientType
  private storesReady: boolean

  private _filesToDownloadXPath: RKVS<FileDetail>
  private _filesToRetryXPath: RKVS<FileDetail>
  private _articleDetailXId: RKVS<ArticleDetail>
  private _redirectsXId: RKVS<ArticleRedirect>

  constructor(redisPath: string, opts?: any) {
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

    this._client = createClient(options)

    this._client.on('error', (err) => {
      if (quitOnError) {
        logger.error('Redis Client Error', err)
        process.exit(3)
      }
    })
  }

  public async connect(populateStores = true) {
    if (this._client.isOpen) {
      return
    }
    await this._client.connect()
    if (populateStores) {
      await this.checkForExistingStores()
      await this.populateStores()
      this.storesReady = true
    }
  }

  public async close() {
    if (this._client.isReady && this.storesReady) {
      logger.log('Flushing Redis DBs')
      await Promise.all([this._filesToDownloadXPath.flush(), this._filesToRetryXPath.flush(), this._articleDetailXId.flush(), this._redirectsXId.flush()])
    }
    if (this._client.isOpen) {
      await this._client.quit()
    }
  }

  public async checkForExistingStores() {
    const patterns = ['*-media', '*-media-retry', '*-detail', '*-redirect']
    let keys: string[] = []
    for (const pattern of patterns) {
      keys = keys.concat(await this._client.keys(pattern))
    }

    keys.forEach(async (key) => {
      try {
        const length = await this._client.hLen(key)
        const time = new Date(Number(key.slice(0, key.indexOf('-'))))
        logger.error(`Found store from previous run from ${time} that is still in redis: ${key} with length ${length}`)
      } catch {
        logger.error(`Key ${key} exists in DB, and is no hash.`)
      }
    })
  }

  private async populateStores() {
    this._filesToDownloadXPath = new RedisKvs(this._client, `${Date.now()}-media`, {
      u: 'url',
      n: 'namespace',
      m: 'mult',
      w: 'width',
    })
    this._filesToRetryXPath = new RedisKvs(this._client, `${Date.now()}-media-retry`, {
      u: 'url',
      n: 'namespace',
      m: 'mult',
      w: 'width',
    })
    this._articleDetailXId = new RedisKvs(this._client, `${Date.now()}-detail`, {
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
    this._redirectsXId = new RedisKvs(this._client, `${Date.now()}-redirect`, {
      t: 'targetId',
      n: 'title',
    })
  }

  public createRedisKvs(...args: [string, KVS<string>?]): RKVS<any> {
    return new RedisKvs(this._client, ...args)
  }

  public get client() {
    return this._client
  }

  public get filesToDownloadXPath(): RKVS<FileDetail> {
    return this._filesToDownloadXPath
  }

  public get filesToRetryXPath(): RKVS<FileDetail> {
    return this._filesToRetryXPath
  }

  public get articleDetailXId(): RKVS<ArticleDetail> {
    return this._articleDetailXId
  }

  public get redirectsXId(): RKVS<ArticleRedirect> {
    return this._redirectsXId
  }
}

export default RedisStore
