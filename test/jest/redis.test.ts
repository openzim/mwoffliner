import {createClient} from 'redis-mock';
import type {RedisClient} from 'redis-mock';
// @ts-ignore
import {initMockData} from './mock/mock';
import {RedisKvs} from '../../src/util/RedisKvs';
import {jest} from '@jest/globals';

let client: RedisClient;
let kvs: RedisKvs<any>;

const numberOfItems = [100, 1000];
const timeouts = [0, 10, 20];

jest.setTimeout(10000);


const getHandler = (delay: number) => async (items: any, workerId: number): Promise<any> => {
  const t = Math.random() * delay;
  return new Promise(((resolve, reject) => {
    setTimeout(() => {
      resolve(null);
    }, t);
  }));
};

const getTestHandler = (handler: (items: any, activeWorkers: number) => any | Promise<any>, numWorkers: number) => async () => {
  const len = await kvs.len();
  const mockHandler = jest.fn(handler);

  await kvs.iterateItems(numWorkers, mockHandler);

  // ...have been called at all
  expect(mockHandler).toHaveBeenCalled();

  let count = 0;
  let maxWorkers = 0;
  mockHandler.mock.calls
    .forEach(([items, activeWorkers]) => {
      count += Object.keys(items).length;
      if (maxWorkers < activeWorkers) {
        maxWorkers = activeWorkers;
      }
    });

  // ...iterated over all items
  expect(count).toEqual(len);
  // used right amount of workers
  expect(maxWorkers).toEqual(numWorkers);
};


beforeAll(() => {
  client = createClient();
  kvs = new RedisKvs<{ value: number }>(client, 'test-kvs');
});


describe('RedisKvs.iterateItems()', () => {

  for (const numItems of numberOfItems) {

    describe(`Items: ${numItems}`, () => {

      beforeAll(async () => {
        client = createClient();
        kvs = new RedisKvs<{ value: number }>(client, 'test-kvs');
        await initMockData(kvs, numItems);
      });

      describe(`Workers: 2`, () => {
        for (const timeout of timeouts) {
          test(`${timeout} ms`, getTestHandler(getHandler(timeout), 2));
        }
      });
    });
  }
});
