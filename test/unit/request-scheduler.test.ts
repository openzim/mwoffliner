import * as backoff from 'backoff'
import { AxiosError } from 'axios'
import { jest } from '@jest/globals'

import { BackoffOptions, RequestScheduler, RequestSchedulerOptions, defaultRetryIf } from '../../src/RequestScheduler.js'

const fastBackoffOptions = (overrides: Partial<BackoffOptions> = {}): BackoffOptions => ({
  strategy: new backoff.FibonacciStrategy({ initialDelay: 1, maxDelay: 1000 }),
  failAfter: 3,
  retryIf: () => true,
  backoffHandler: () => {},
  ...overrides,
})

const createScheduler = (options: Partial<RequestSchedulerOptions> = {}) =>
  new RequestScheduler({
    workers: 2,
    pageRequestInterval: 150,
    requestTimeout: 5000,
    ...options,
  })

const schedule = (scheduler: RequestScheduler, handler: (...args: any[]) => void) =>
  new Promise<{ err: any; val: any }>((resolve) => {
    scheduler.schedule(handler, 'https://example.org/resource', 'json', 320, (err: any, val: any) => resolve({ err, val }))
  })

const reply = (cb: (...args: any[]) => void, ...args: any[]) => setImmediate(() => cb(...args))

describe('RequestScheduler', () => {
  test('exposes rate limit and timeout settings', () => {
    const scheduler = createScheduler()

    expect(scheduler.workers).toBe(2)
    expect(scheduler.pageRequestInterval).toBe(150)
    expect(scheduler.requestTimeout).toBe(5000)
  })

  test('calls the handler with the scheduled arguments and forwards its result', async () => {
    const scheduler = createScheduler()
    const handler = jest.fn((_url: string, _kind: DownloadKind, _displayWidth: number | undefined, cb: (...args: any[]) => void) => {
      reply(cb, null, { ok: true })
    })

    const { err, val } = await schedule(scheduler, handler)

    expect(err).toBeNull()
    expect(val).toEqual({ ok: true })
    expect(handler).toHaveBeenCalledWith('https://example.org/resource', 'json', 320, expect.any(Function))
  })

  test('retries failed attempts accepted by the retry policy until they succeed', async () => {
    const scheduler = createScheduler({ backoffOptions: fastBackoffOptions() })
    let attempts = 0
    const handler = jest.fn((_url: string, _kind: DownloadKind, _displayWidth: number | undefined, cb: (...args: any[]) => void) => {
      attempts += 1
      if (attempts < 2) {
        reply(cb, new Error('transient failure'))
      } else {
        reply(cb, null, 'done')
      }
    })

    const { err, val } = await schedule(scheduler, handler)

    expect(err).toBeNull()
    expect(val).toBe('done')
    expect(attempts).toBe(2)
  })

  test('stops retrying after failAfter and forwards the last error', async () => {
    const scheduler = createScheduler({ backoffOptions: fastBackoffOptions({ failAfter: 2 }) })
    let attempts = 0
    const handler = jest.fn((_url: string, _kind: DownloadKind, _displayWidth: number | undefined, cb: (...args: any[]) => void) => {
      attempts += 1
      reply(cb, new Error(`failure ${attempts}`))
    })

    const { err, val } = await schedule(scheduler, handler)

    expect(attempts).toBe(3)
    expect(val).toBeUndefined()
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('failure 3')
  })

  test('does not retry failures rejected by the retry policy', async () => {
    const scheduler = createScheduler({ backoffOptions: fastBackoffOptions({ retryIf: () => false }) })
    let attempts = 0
    const handler = jest.fn((_url: string, _kind: DownloadKind, _displayWidth: number | undefined, cb: (...args: any[]) => void) => {
      attempts += 1
      reply(cb, new Error('fatal'))
    })

    const { err } = await schedule(scheduler, handler)

    expect(attempts).toBe(1)
    expect((err as Error).message).toBe('fatal')
  })

  test('reports each backoff through the configured handler', async () => {
    const backoffHandler = jest.fn()
    const scheduler = createScheduler({ backoffOptions: fastBackoffOptions({ failAfter: 1, backoffHandler }) })
    const handler = jest.fn((_url: string, _kind: DownloadKind, _displayWidth: number | undefined, cb: (...args: any[]) => void) => {
      reply(cb, new Error('failure'))
    })

    await schedule(scheduler, handler)

    expect(backoffHandler).toHaveBeenCalledTimes(1)
    expect(backoffHandler).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Error))
  })
})

describe('RequestScheduler default retry policy', () => {
  test('retries malformed JSON responses', () => {
    const wrapped = new AxiosError('Failed to parse API response', AxiosError.ERR_BAD_RESPONSE)
    ;(wrapped as any).cause = new SyntaxError('Unexpected end of JSON input')

    expect(defaultRetryIf(wrapped)).toBe(true)
  })

  test('retries connection issues', () => {
    const err = new AxiosError('socket hang up', 'ECONNRESET')

    expect(defaultRetryIf(err)).toBe(true)
  })

  test('retries lagging MediaWiki servers', () => {
    expect(defaultRetryIf({ urlCalled: 'https://example.org/api', responseData: { error: { code: 'maxlag', lag: 5 } } })).toBe(true)
  })

  test.each([429, 500, 502, 503, 504, 524])('retries HTTP %i responses', (status) => {
    expect(defaultRetryIf({ urlCalled: 'https://example.org/api', httpReturnCode: status })).toBe(true)
  })

  test('retries transient MediaWiki error codes', () => {
    expect(defaultRetryIf({ urlCalled: 'https://example.org/api', responseData: { error: { code: 'internal_api_error_Unknown' } } })).toBe(true)
  })

  test.each(['missingtitle', 'readapidenied', 'permissiondenied'])('does not retry the %s MediaWiki error code', (code) => {
    expect(defaultRetryIf({ urlCalled: 'https://example.org/api', responseData: { error: { code } } })).toBe(false)
  })

  test('does not retry non-transient HTTP responses', () => {
    expect(defaultRetryIf({ urlCalled: 'https://example.org/api', httpReturnCode: 418 })).toBe(false)
  })
})
