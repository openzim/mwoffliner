import type { RedisClientType } from 'redis'

export default class RedisKvs<T> implements RKVS<T> {
  private redisClient: RedisClientType
  private readonly dbName: string
  private readonly dehydratedKeys?: string[]
  private readonly hydratedKeys?: string[]

  constructor(redisClient: RedisClientType, dbName: string, keyMapping?: KVS<string>) {
    this.redisClient = redisClient
    this.dbName = dbName
    if (keyMapping) {
      this.hydratedKeys = Object.values(keyMapping)
      this.dehydratedKeys = Object.keys(keyMapping)
    }
  }

  public async get(prop: string): Promise<T> {
    const val = await this.redisClient.hGet(this.dbName, prop)
    return this.hydrateObject(val)
  }

  public async getMany(prop: string[]): Promise<KVS<T>> {
    const replies = await this.redisClient.hmGet(this.dbName, prop)
    const result: KVS<T> = {}
    for (let u = 0; u < prop.length; u += 1) {
      result[prop[u]] = this.hydrateObject(replies[u])
    }
    return result
  }

  public exists(prop: string): Promise<boolean> {
    return this.redisClient.hExists(this.dbName, prop)
  }

  public async existsMany(prop: string[], blocking = false): Promise<KVS<boolean>> {
    // array of keys
    const multi = this.redisClient.multi()
    prop.forEach((index) => {
      multi.hExists(this.dbName, index)
    })
    const replies: any[] = await multi.exec(!blocking)
    const result: KVS<boolean> = {}
    for (let u = 0; u < prop.length; u += 1) {
      result[prop[u]] = replies[u]
    }
    return result
  }

  public set(prop: string, val: T): Promise<number> {
    return this.redisClient.hSet(this.dbName, prop, this.dehydrateObject(val))
  }

  public async setMany(val: KVS<T>): Promise<number> {
    const keys = Object.keys(val)
    if (!keys.length) {
      return 0
    }
    const data: KVS<string> = {}
    for (const key of keys) {
      data[key] = this.dehydrateObject(val[key])
    }
    return this.redisClient.hSet(this.dbName, data)
  }

  public delete(prop: string): Promise<number> {
    return this.redisClient.hDel(this.dbName, prop)
  }

  public deleteMany(prop: string[]): Promise<number> {
    return this.redisClient.hDel(this.dbName, prop)
  }

  public keys(): Promise<string[]> {
    return this.redisClient.hKeys(this.dbName)
  }

  public len(): Promise<number> {
    return this.redisClient.hLen(this.dbName)
  }

  public iterateItems(numWorkers: number, func: (items: KVS<T>, runningWorkers: number) => Promise<void>): Promise<void> {
    return new Promise(async (resolve, reject) => {
      let runningWorkers = 0
      let isScanning = false
      let done = false
      let isResolved = false
      let scanCursor = 0

      const scan = async () => {
        if (runningWorkers >= numWorkers || isScanning || isResolved) {
          return
        }
        if (done) {
          if (!runningWorkers) {
            isResolved = true
            resolve(null)
          }
          return
        }
        isScanning = true

        try {
          runningWorkers += 1
          const { cursor, items } = await this.scan(scanCursor)
          scanCursor = cursor
          if (scanCursor === 0) {
            done = true
          }
          setImmediate(workerFunc, items)
        } catch (err) {
          if (!isResolved) {
            isResolved = true
            reject(err)
          }
        }
        isScanning = false
        setImmediate(scan)
      }

      const workerFunc = async (items: KVS<T>) => {
        try {
          await func(items, runningWorkers)
          runningWorkers -= 1
          setImmediate(scan)
        } catch (err) {
          if (!isResolved) {
            isResolved = true
            reject(err)
          }
        }
      }

      scan()
    })
  }

  public async scan(scanCursor: number): Promise<{
    cursor: number
    items: KVS<T>
  }> {
    const { cursor, tuples } = await this.redisClient.hScan(this.dbName, scanCursor)
    const items: KVS<T> = {}
    for (const { field, value } of tuples) {
      items[field] = this.hydrateObject(value)
    }
    return {
      cursor,
      items,
    }
  }

  public flush(): Promise<number> {
    return this.redisClient.del(this.dbName)
  }

  private hydrateObject(value: string): any {
    if (!value) {
      return value
    }
    const obj = JSON.parse(value)
    if (this.hydratedKeys && typeof obj === 'object') {
      const mappedVal: any = {}
      for (const key of Object.keys(obj)) {
        const mapIndex = this.dehydratedKeys.indexOf(key)
        if (mapIndex !== -1) {
          mappedVal[this.hydratedKeys[mapIndex]] = obj[key]
        } else {
          mappedVal[key] = obj[key]
        }
      }
      return mappedVal
    }
    return obj
  }

  private dehydrateObject(obj: any): string {
    let mappedVal = obj
    if (obj && this.dehydratedKeys && typeof obj === 'object') {
      mappedVal = {}
      for (const key of Object.keys(obj)) {
        const mapIndex = this.hydratedKeys.indexOf(key)
        if (mapIndex !== -1) {
          mappedVal[this.dehydratedKeys[mapIndex]] = obj[key]
        } else {
          mappedVal[key] = obj[key]
        }
      }
    }
    return typeof mappedVal === 'string' ? mappedVal : JSON.stringify(mappedVal)
  }
}
