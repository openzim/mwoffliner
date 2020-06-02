// noinspection ES6UnusedImports
import {} from 'ts-jest';
import {createClient} from 'redis-mock';
import type {RedisClient} from 'redis-mock';
// @ts-ignore
import {initMockData} from './mock/redis';
import {RedisKvs} from '../../src/util/RedisKvs';


let client: RedisClient;
let kvs: RedisKvs<any>;

const numberOfItems = [100, 1000];
const timeouts = [0, 10, 20];

jest.setTimeout(10000);


const getHandler = (delay: number) => async (items: any, workerId: number): Promise<any> => {
  const t = Math.random() * delay;
  return new Promise(((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, t);
  }));
};

const getTestHandler = (handler: (items: any, workerId: number) => any | Promise<any>, numWorkers: number) => async () => {
  const len = await kvs.len();
  const mockHandler = jest.fn(handler);

  await kvs.iterateItems(numWorkers, mockHandler);

  // ...have been called at all
  expect(mockHandler).toHaveBeenCalled();

  let count = 0;
  const workers = new Set();
  mockHandler.mock.calls
    .forEach(([items, workerId]) => {
      count += Object.keys(items).length;
      workers.add(workerId);
    });

  // ...iterated over all items
  expect(count).toEqual(len);

  // ...using proper workers
  const workersUsed = Array.from(workers) as number[];
  const workerIdsExpected = Array.from(Array(numWorkers).keys());
  const workerIdsUnexpected = workersUsed.filter((x) => !workerIdsExpected.includes(x));
  const workerIdsUnused = workerIdsExpected.filter((x) => !workersUsed.includes(x));

  expect(workerIdsUnused.length).toEqual(0);
  expect(workerIdsUnexpected.length).toEqual(0);
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

      describe(`Workers: 1`, () => {
        for (const timeout of timeouts) {
          test(`${timeout} ms`, getTestHandler(getHandler(timeout), 1));
        }
      });
    });
  }
});
