// noinspection ES6UnusedImports
import {} from 'ts-jest';
import {createClient} from 'redis-mock';
import {fetchMockData} from './mock/mock';
import type {RedisClient} from 'redis-mock';
import {RedisKvs} from '../../src/util/RedisKvs';

let client: RedisClient;
let kvs: RedisKvs<any>;

const items = 10000;
const numWorkers = 24;

const intermediateHandler = (items: KVS<any>, workerId: number): any => {
  // nop
};

const delayedHandler = async (items: KVS<any>, workerId: number): Promise<any> => {
  // console.table(items);
  const t = Math.random() * 20;
  // console.log(`${workerId} - ${t.toFixed()} ms - ${Object.keys(items).length} items`);
  return new Promise(((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, t);
  }));
};

// tslint:disable-next-line:ban-types
const getHandler = (handler: (items: KVS<any>, workerId: number) => any | Promise<any>) => async () => {
  const len = await kvs.len();
  // @ts-ignore
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

  describe(`Workers: ${numWorkers}, items: ${items}`, () => {

    beforeAll(async () => {
      client = createClient();
      kvs = new RedisKvs<{ value: number }>(client, 'test-kvs');
      await fetchMockData(kvs, items);
    });

    test('With intermediate handler', getHandler(intermediateHandler));
    test('With delayed handler', getHandler(delayedHandler));
  });
});
