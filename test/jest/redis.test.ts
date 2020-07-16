import 'ts-jest';
import {createClient} from 'redis';
import type {RedisClient} from 'redis';
// @ts-ignore
import {initMockData} from './mock/mock';
import {RedisKvs} from '../../src/util/RedisKvs';

const now = new Date();
const timeout = 0;
const numberOfItems = [13973];
// const numberOfItems = [718, 3169, 17563];
// const numberOfWorkers = [4, 8, 16, 40];
const numberOfWorkers = [1];


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

const getTestHandler = async (kvs: RedisKvs<any>, handler: (items: any, workerId: number) => any | Promise<any>, numWorkers: number) => {
  const mockHandler = jest.fn(handler);

  const testingDataByWorkers = await kvs.iterateItems(numWorkers, mockHandler);

  // ...have been called at all
  // todo get this back
  // expect(mockHandler).toHaveBeenCalled();

  let count = 0;
  const workers = new Set();
  mockHandler.mock.calls
    .forEach(([items, workerId]) => {
      count += Object.keys(items).length;
      workers.add(workerId);
    });

  // todo
  // fn has been called expected times
  // expect(count).toEqual(len);


  const workersUsed = Array.from(workers) as number[];
  const workerIdsExpected = Array.from(Array(numWorkers).keys());
  const workerIdsUnexpected = workersUsed.filter((x) => !workerIdsExpected.includes(x));
  const workerIdsUnused = workerIdsExpected.filter((x) => !workersUsed.includes(x));

  // all workers got the load
  expect(workerIdsUnused).toEqual([]);

  // there's no unexpected workers
  expect(workerIdsUnexpected).toEqual([]);


  let idsProcessed: string[] = [];
  // @ts-ignore
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


// beforeAll(() => {
//   client = createClient();
//   kvs = new RedisKvs<{ value: number }>(client, 'test-kvs');
// });


describe('RedisKvs.iterateItems()', () => {

  for (const numItems of numberOfItems) {

    let kvs: RedisKvs<any>;
    let client: RedisClient;

    describe(`Items: ${numItems}`, () => {

      test(`Mock data`, async () => {
        client = createClient();
        kvs = new RedisKvs<{ value: number }>(client, `test-kvs-${numItems}-${now.getMilliseconds()}`);
        expectedIds = await initMockData(kvs, numItems);
      });

      for (const n of numberOfWorkers) {
        test(`Workers: ${n}`, async () => await getTestHandler(kvs, getHandler(timeout), n));
      }
    });
  }
});
