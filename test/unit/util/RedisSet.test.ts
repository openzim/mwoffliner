import RedisSet from '../../../src/util/RedisSet.js'
import RedisStore from '../../../src/RedisStore.js'
import { startRedis, stopRedis } from '../bootstrap.js'

describe('Test RedisSet operations', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  let set1: RedisSet
  let set2: RedisSet

  beforeAll(async () => {
    const client = RedisStore.client
    set1 = new RedisSet(client, 'test-set1')
    await set1.flush()
    set2 = new RedisSet(client, 'test-set2')
    await set2.flush()
  })

  test('add and has', async () => {
    expect(await set1.add('value1')).toBe(true)
    expect(await set1.add('value1')).toBe(false)
    expect(await set1.has('value1')).toBe(true)
    expect(await set1.has('missing')).toBe(false)
  })

  test('set isolation and remove', async () => {
    await set1.add('value1')
    await set2.add('value2')

    expect(await set1.has('value1')).toBe(true)
    expect(await set1.has('value2')).toBe(false)
    expect(await set2.has('value2')).toBe(true)

    expect(await set1.remove('value1')).toBe(1)
    expect(await set1.remove('value1')).toBe(0)
    expect(await set1.has('value1')).toBe(false)
  })

  test('len and flush', async () => {
    await set1.flush()
    await set1.add('a')
    await set1.add('b')
    await set1.add('b')

    expect(await set1.len()).toBe(2)

    await set1.flush()
    expect(await set1.len()).toBe(0)
  })
})
