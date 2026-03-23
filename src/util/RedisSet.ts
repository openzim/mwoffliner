import type { RedisClientType } from 'redis'

export default class RedisSet {
  private redisClient: RedisClientType
  private readonly dbName: string

  constructor(redisClient: RedisClientType, dbName: string) {
    this.redisClient = redisClient
    this.dbName = dbName
  }

  public async add(value: string): Promise<boolean> {
    return (await this.redisClient.sAdd(this.dbName, value)) > 0
  }

  public has(value: string): Promise<boolean> {
    return this.redisClient.sIsMember(this.dbName, value)
  }

  public remove(value: string): Promise<number> {
    return this.redisClient.sRem(this.dbName, value)
  }

  public deleteMany(values: string[]): Promise<number> {
    if (!values.length) {
      return Promise.resolve(0)
    }
    return this.redisClient.sRem(this.dbName, values)
  }

  public len(): Promise<number> {
    return this.redisClient.sCard(this.dbName)
  }

  public flush(): Promise<number> {
    return this.redisClient.del(this.dbName)
  }
}
