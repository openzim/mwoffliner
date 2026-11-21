import { jest } from '@jest/globals'
import RedisStore from '../../src/RedisStore.js'
import * as logger from '../../src/Logger.js'

describe('RedisStore fatal errors', () => {
  let stdoutSpy: ReturnType<typeof jest.spyOn>

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    logger.setLogLevel('silent')
  })

  test('reports the last connection error and OOM diagnosis before exiting', () => {
    RedisStore.setOptions('/tmp/mwoffliner-redis-diagnostics.sock', { quitOnError: true })
    logger.setLogLevel('error')
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any)
    const client = RedisStore.client as any

    const reconnectStrategy = RedisStore.client.options.socket?.reconnectStrategy as (retries: number, cause: Error) => number | Error
    const cause = new Error('connect ECONNREFUSED /dev/shm/redis.sock')
    const fatalError = reconnectStrategy(10, cause)

    if (!(fatalError instanceof Error)) {
      throw new Error('Expected reconnect strategy to give up')
    }

    client.emit('error', fatalError)

    expect(exitSpy).toHaveBeenCalledWith(3)
    const output = stdoutSpy.mock.calls.map((call) => String(call[0])).join('')
    expect(output).toContain('Redis connection lost permanently')
    expect(output).toContain('last error: connect ECONNREFUSED /dev/shm/redis.sock')
    expect(output).toContain('OOM-killed redis-server is not restarted')
  })

  test('keeps retrying transient errors without exiting', () => {
    RedisStore.setOptions('/tmp/mwoffliner-redis-diagnostics.sock', { quitOnError: true })
    logger.setLogLevel('warn')
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any)
    const client = RedisStore.client as any
    Object.defineProperty(client, 'isOpen', { value: true, configurable: true })

    client.emit('error', new Error('read ECONNRESET'))

    expect(exitSpy).not.toHaveBeenCalled()
    const output = stdoutSpy.mock.calls.map((call) => String(call[0])).join('')
    expect(output).toContain('Redis Client Error, will try to reconnect')
    expect(output).not.toContain('Redis connection lost permanently')
  })
})
