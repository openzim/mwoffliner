import { initMockData, MockRedis } from './mock/mockRedis.js'
import RedisKvs from '../../src/util/RedisKvs.js'
import { jest } from '@jest/globals'

let client: MockRedis
let kvs: RKVS<any>

const numberOfItems = [100, 1000]
const timeouts = [0, 10, 20]

jest.setTimeout(10000)

const getHandler = (delay: number) => async (): Promise<any> => {
  const t = Math.random() * delay
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(null)
    }, t)
  })
}

const getTestHandler = (handler: (items: any, activeWorkers: number) => any | Promise<any>, numWorkers: number) => async () => {
  const len = await kvs.len()
  const mockHandler = jest.fn(handler)

  await kvs.iterateItems(numWorkers, mockHandler)

  // ...have been called at all
  expect(mockHandler).toHaveBeenCalled()

  let count = 0
  let maxWorkers = 0
  mockHandler.mock.calls.forEach(([items, activeWorkers]) => {
    count += Object.keys(items).length
    if (maxWorkers < activeWorkers) {
      maxWorkers = activeWorkers
    }
  })

  // ...iterated over all items
  expect(count).toEqual(len)
  // used right amount of workers
  expect(maxWorkers).toEqual(numWorkers)
}

describe('RedisKvs.iterateItems()', () => {
  for (const numItems of numberOfItems) {
    describe(`Items: ${numItems}`, () => {
      beforeAll(async () => {
        client = new MockRedis()
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        kvs = new RedisKvs(client, 'test-kvs')
        await initMockData(kvs, numItems)
      })

      describe('Workers: 2', () => {
        for (const timeout of timeouts) {
          test(`${timeout} ms`, getTestHandler(getHandler(timeout), 2))
        }
      })
    })
  }
})
