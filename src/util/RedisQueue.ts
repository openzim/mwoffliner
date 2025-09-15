import type { RedisClientType } from 'redis'

export default class RedisQueue<T> {
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

  public async pop(): Promise<T> {
    const val = await this.redisClient.rPop(this.dbName)
    return this.hydrateObject(val)
  }

  public push(val: T): Promise<number> {
    return this.redisClient.lPush(this.dbName, this.dehydrateObject(val))
  }

  public len(): Promise<number> {
    return this.redisClient.hLen(this.dbName)
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
