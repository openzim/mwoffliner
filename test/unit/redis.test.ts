import RedisKvs from '../../src/util/RedisKvs.js'
import RedisStore from '../../src/RedisStore.js'
import { startRedis, stopRedis } from './bootstrap.js'

describe('Redis', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  const mock = {
    testItem1: { value: 1 },
    testItem2: { value: 2 },
    testItem3: { value: 3 },
    testItem4: { value: 4 },
  }

  test('Redis Tests', async () => {
    const kvs = new RedisKvs<{ value: number }>(RedisStore.client, 'test-kvs')

    const len = await kvs.len()
    // New RedisKVS should have 0 items
    expect(len).toEqual(0)

    await Promise.all(Object.entries(mock).map(([k, v]) => kvs.set(k, v)))

    const newLen = await kvs.len()
    // Can set items
    expect(newLen).toEqual(4)

    const newKeys = await kvs.keys()
    const areKeysCorrect =
      newKeys.length === newLen && newKeys.filter((x) => !Object.keys(mock).includes(x)).length === 0 && Object.keys(mock).filter((x) => !newKeys.includes(x)).length === 0
    // Can get the keys properly
    expect(areKeysCorrect).toBeTruthy()

    const item2 = await kvs.get('testItem2')
    // Can get single item
    expect(item2.value).toEqual(2)

    const { testItem1, testItem4 } = await kvs.getMany(['testItem1', 'testItem4'])
    // Can get multiple items (1/2)
    expect(testItem1.value).toEqual(1)
    // Can get multiple items (2/2)
    expect(testItem4.value).toEqual(4)

    await kvs.delete('testItem2')
    const deletedTestItem2 = await kvs.get('testItem2')
    // Can delete single item
    expect(deletedTestItem2).toBeNull()

    await kvs.deleteMany(['testItem1', 'testItem4'])
    const { deletedTestItem1, deletedTestItem4 } = await kvs.getMany(['testItem1', 'testItem4'])
    // Can delete multiple items (1/2)
    expect(deletedTestItem1).toBeUndefined()
    // Can delete multiple items (2/2)
    expect(deletedTestItem4).toBeUndefined()

    await kvs.flush()

    const flushedLen = await kvs.len()
    // Can flush KVS
    expect(flushedLen).toEqual(0)
  })
})
