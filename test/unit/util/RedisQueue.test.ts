import RedisQueue from '../../../src/util/RedisQueue.js'
import RedisStore from '../../../src/RedisStore.js'
import { startRedis, stopRedis } from '../bootstrap.js'

describe('Test RedisQueue operations', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  let queue1: RedisQueue<Value>
  let queue2: RedisQueue<Value>

  beforeAll(() => {
    const client = RedisStore.client
    queue1 = new RedisQueue<Value>(client, 'test-queue1', {
      v: 'value',
    })
    queue1.flush()
    queue2 = new RedisQueue<Value>(client, 'test-queue2', {
      v: 'value',
    })
    queue2.flush()
  })

  interface Value {
    value: string
  }

  test('simple test', async () => {
    queue1.push({ value: 'value1' })
    queue1.push({ value: 'value2' })
    expect((await queue1.pop()).value).toBe('value1')
    expect((await queue1.pop()).value).toBe('value2')
  })

  test('mixed test', async () => {
    queue1.push({ value: 'value1' })
    queue2.push({ value: 'value2' })
    queue1.push({ value: 'value3' })
    queue2.push({ value: 'value4' })
    expect((await queue1.pop()).value).toBe('value1')
    expect((await queue2.pop()).value).toBe('value2')
    queue1.push({ value: 'value5' })
    expect((await queue1.pop()).value).toBe('value3')
    expect((await queue1.pop()).value).toBe('value5')
    expect((await queue2.pop()).value).toBe('value4')
    queue2.push({ value: 'value6' })
    expect((await queue2.pop()).value).toBe('value6')
  })
})
