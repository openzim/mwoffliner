import 'ts-jest';
import {createClient} from 'redis-mock';
import type {RedisClient} from 'redis-mock';
// @ts-ignore
import {initMockData} from './mock/mock';
import {RedisKvs} from '../../src/util/RedisKvs';

let client: RedisClient;
let kvs: RedisKvs<any>;

// will be rounded to a largest multiple of 250 (because of mock size)
const numberOfItems = [7250];
const timeouts = [0];
// const numberOfItems = [100, 1000];
// const timeouts = [0, 10, 20];

let expectedIds: number[];

jest.setTimeout(30000);


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

  const testingDataByWorkers = await kvs.iterateItems(numWorkers, mockHandler);

  // ...have been called at all
  expect(mockHandler).toHaveBeenCalled();

  let count = 0;
  const workers = new Set();
  mockHandler.mock.calls
    .forEach(([items, workerId]) => {
      count += Object.keys(items).length;
      workers.add(workerId);
    });

  // todo
  // ...iterated over all items
  expect(count).toEqual(len);


  const workersUsed = Array.from(workers) as number[];
  const workerIdsExpected = Array.from(Array(numWorkers).keys());
  const workerIdsUnexpected = workersUsed.filter((x) => !workerIdsExpected.includes(x));
  const workerIdsUnused = workerIdsExpected.filter((x) => !workersUsed.includes(x));

  // all workers got the load
  expect(workerIdsUnused.length).toEqual(0);

  // there's no unexpected workers
  expect(workerIdsUnexpected.length).toEqual(0);


  let idsProcessed: number[] = [];
  for (const testingData of testingDataByWorkers) {
    idsProcessed = idsProcessed.concat(testingData.ids);
  }

  // every single item had been processed
  const idsUnprocessed = expectedIds.filter((x) => !idsProcessed.includes(x));
  expect(idsUnprocessed.length).toEqual(0);

  // there's no unexpected items processed
  const idsUnexpected = idsProcessed.filter((x) => !expectedIds.includes(x));
  expect(idsUnexpected.length).toEqual(0);

  // there's no items processed more than once
  const idsUnique = [...new Set(idsProcessed)];
  expect(idsUnique.length).toEqual(idsProcessed.length);
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
        expectedIds = await initMockData(kvs, numItems);
      });

      describe(`Workers: 1`, () => {
        for (const timeout of timeouts) {
          test(`${timeout} ms`, getTestHandler(getHandler(timeout), 2));
        }
      });
    });
  }
});
