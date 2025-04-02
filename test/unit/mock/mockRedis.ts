import data from './sg.json'

/*
 * get mock data
 */
export const initMockData = async (kvs: RKVS<any>, size?: number): Promise<void> => {
  const len = Object.keys(data).length
  const multiplier = (size ?? len) / len

  for (let i = 0; i < multiplier; i++) {
    const d: Array<{ n: string; r: number; t: string }> = []
    Object.values(data).forEach((item, x) => {
      d.push({ ...item, n: `${data[x].n}_${i}` })
    })
    await kvs.setMany(d)
  }
}

/*
 * mock of RedisClient that is just providing
 * the most basic methods to test RedisKvs.iterateItems
 */
export class MockRedis {
  private data: KVS<string> = {}
  private nextCursor: number

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async hLen(dbName: string): Promise<number> {
    return Object.keys(this.data).length
  }

  async hSet(dbName: string, newData: KVS<string> | string, value?: any): Promise<number> {
    if (typeof newData === 'object') {
      this.data = {
        ...this.data,
        ...newData,
      }
      return Object.keys(newData).length
    }
    this.data[newData] = String(value)
    return 1
  }

  async hScan(dbName: string, cursor: number): Promise<{ cursor: number; tuples: { field: string; value: string }[] }> {
    let amount = 9 + Math.floor(Math.random() * 3)
    const maxLength = await this.hLen('')
    let curCursor = this.nextCursor

    if (cursor < 0 || cursor >= maxLength) {
      throw new Error(`Cursor ${cursor} is out of range`)
    }
    if (!curCursor) {
      if (cursor !== 0) {
        throw new Error(`No running iteration, ${cursor} ${curCursor}`)
      }
      curCursor = 0
      amount = Math.min(amount, maxLength)
    } else if (curCursor !== cursor) {
      throw new Error(`Invalid cursor ${cursor}`)
    } else {
      amount = Math.min(curCursor + amount, maxLength) - curCursor
    }

    const nextCursor = curCursor + amount

    const tuples = Object.keys(this.data)
      .slice(curCursor, nextCursor)
      .map((key) => {
        return { field: key, value: this.data[key] }
      })
    this.nextCursor = nextCursor >= maxLength ? 0 : nextCursor

    await new Promise((res) => setTimeout(res, Math.floor(Math.random() * 10)))

    return {
      cursor: this.nextCursor,
      tuples,
    }
  }
}
