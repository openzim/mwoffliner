import RedisKvs from '../../src/util/RedisKvs.js'
import RedisQueue from '../../src/util/RedisQueue.js'
import RedisStore from '../../src/RedisStore.js'
import { startRedis, stopRedis } from './bootstrap.js'

describe('Redis reconnection', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  // Kill the connection of our client from the server side, like an ECONNRESET would do
  const killClientConnection = async (clientId: number) => {
    const admin = RedisStore.client.duplicate()
    await admin.connect()
    try {
      await admin.clientKill({ filter: 'ID', id: clientId } as any)
    } finally {
      await admin.quit()
    }
  }

  test('Commands survive a connection reset', async () => {
    const kvs = new RedisKvs<{ value: number }>(RedisStore.client, 'test-kvs-reconnect')
    const queue = new RedisQueue<{ value: number }>(RedisStore.client, 'test-queue-reconnect')
    await Promise.all([kvs.flush(), queue.flush()])

    await kvs.set('before', { value: 1 })

    // Many commands are in flight while the connection gets killed, they must all eventually succeed
    const items = Array.from({ length: 5000 }, (_, i) => i)
    const clientId = await RedisStore.client.clientId()
    const pending = Promise.all([...items.map((i) => kvs.set(`item${i}`, { value: i })), ...items.map((i) => queue.push({ value: i }))])
    await killClientConnection(clientId)
    await pending

    expect(await kvs.len()).toEqual(items.length + 1)
    expect((await kvs.get('before')).value).toEqual(1)
    expect((await kvs.get('item42')).value).toEqual(42)
    expect(await queue.len()).toBeGreaterThanOrEqual(items.length)
    expect(RedisStore.client.isReady).toBeTruthy()

    await Promise.all([kvs.flush(), queue.flush()])
  })
})
