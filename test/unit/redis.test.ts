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

describe('RedisStore: pageDetailStore', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  const mockPages = {
    London: {
      title: 'London' as PageTitle,
      categories: ['City'],
      revisionId: 123,
      coordinates: '51.5074,0.1278',
    },
    UK: {
      title: 'United_Kingdom' as PageTitle,
      categories: ['Country'],
      revisionId: 456,
      thumbnail: { source: 'uk.png', height: 200, width: 200 },
    },
    TestPage: {
      title: 'TestPage' as PageTitle,
      categories: [],
      revisionId: 789,
    },
  }

  beforeEach(async () => {
    await RedisStore.pagesStore.flush()
  })
  //
  test('set and get single page', async () => {
    // if it fails that means serialization/deserialization is broken
    const kvs = RedisStore.pagesStore

    await kvs.set('London', mockPages.London)
    const result = await kvs.get('London')

    expect(result).toBeDefined()
    expect(result?.title).toBe('London')
    expect(result?.categories?.[0]).toBe('City')
    expect(result?.revisionId).toBe(123)
    expect(result?.coordinates).toBe('51.5074,0.1278')
  })

  test('set and get multiple pages', async () => {
    // if it fails that means bulk retrieval is broken
    const kvs = RedisStore.pagesStore

    await kvs.set('London', mockPages.London)
    await kvs.set('UK', mockPages.UK)

    const results = await kvs.getMany(['London', 'UK'])

    expect(results.London).toBeDefined()
    expect(results.UK).toBeDefined()
    expect(results.UK?.thumbnail?.source).toBe('uk.png')
  })

  test('delete single and multiple pages', async () => {
    // if it fails that means memory leaks in Redis
    const kvs = RedisStore.pagesStore

    await kvs.set('London', mockPages.London)
    await kvs.set('UK', mockPages.UK)

    await kvs.delete('London')
    const deleted = await kvs.get('London')
    expect(deleted).toBeNull()

    await kvs.deleteMany(['UK'])
    const results = await kvs.getMany(['UK'])
    expect(results.UK).toBeNull()
  })

  test('keys, len and flush', async () => {
    const kvs = RedisStore.pagesStore

    await kvs.set('London', mockPages.London)
    await kvs.set('UK', mockPages.UK)
    await kvs.set('TestPage', mockPages.TestPage)

    const keys = await kvs.keys()
    expect(keys.length).toBe(3)
    expect(keys).toEqual(expect.arrayContaining(['London', 'UK', 'TestPage']))

    const len = await kvs.len()
    expect(len).toBe(3)

    await kvs.flush()
    const newLen = await kvs.len()
    expect(newLen).toBe(0)
  })

  test('edge cases: non-existent keys', async () => {
    // if it fails that means error in fucntion's logic
    const kvs = RedisStore.pagesStore

    const result = await kvs.get('DoesNotExist')
    expect(result).toBeNull()

    const many = await kvs.getMany(['Nope1', 'Nope2'])
    expect(many.Nope1).toBeNull()
    expect(many.Nope2).toBeNull()

    await kvs.delete('Nope1')
    await kvs.deleteMany(['Nope2'])
  })

  test('overwrite existing page', async () => {
    // if this fails this means that updates dont propogate
    const kvs = RedisStore.pagesStore

    await kvs.set('London', mockPages.London)

    await kvs.set('London', {
      title: 'London Updated' as PageTitle,
      categories: ['Capital'],
      revisionId: 999,
    })

    const updated = await kvs.get('London')

    expect(updated?.title).toBe('London Updated')
    expect(updated?.categories?.[0]).toBe('Capital')
    expect(updated?.revisionId).toBe(999)
  })
})
