import 'ts-jest';
import {createClient} from 'redis-mock';
import type {RedisClient} from 'redis-mock';
// @ts-ignore
import {initMockData} from './mock/mock';
import {RedisKvs} from '../../src/util/RedisKvs';

let client: RedisClient;
let kvs: RedisKvs<any>;

const timeout = 0;
const numberOfItems = [718, 3169, 17563];
const numberOfWorkers = [4, 8, 16, 40];

let expectedIds: string[];

jest.setTimeout(60000);


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
  // fn has been called expected times
  expect(count).toEqual(len);


  const workersUsed = Array.from(workers) as number[];
  const workerIdsExpected = Array.from(Array(numWorkers).keys());
  const workerIdsUnexpected = workersUsed.filter((x) => !workerIdsExpected.includes(x));
  const workerIdsUnused = workerIdsExpected.filter((x) => !workersUsed.includes(x));

  // all workers got the load
  expect(workerIdsUnused).toEqual([]);

  // there's no unexpected workers
  expect(workerIdsUnexpected).toEqual([]);


  let idsProcessed: string[] = [];
  for (const testingData of testingDataByWorkers) {
    idsProcessed = idsProcessed.concat(testingData.ids);
  }

  // every single item had been processed
  const idsUnprocessed = expectedIds.filter((x) => !idsProcessed.includes(x));
  expect(idsUnprocessed).toEqual([]);

  // there's no unexpected items processed
  const idsUnexpected = idsProcessed.filter((x) => !expectedIds.includes(x));
  expect(idsUnexpected).toEqual([]);

  // there's no items processed more than once
  const idsUnique = [...new Set(idsProcessed)];
  expect(idsUnique).toEqual(idsProcessed);
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

      for (const n of numberOfWorkers) {
        test(`Workers: ${n}`, getTestHandler(getHandler(timeout), n));
      }
    });
  }
});
