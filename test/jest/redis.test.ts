import {} from 'ts-jest';
import {createClient} from 'redis-mock';
import type {RedisClient} from 'redis-mock';
import {RedisKvs} from '../../src/util/RedisKvs';
import {fetchMockData} from './mock/mock';

let client: RedisClient;
let kvs: RedisKvs<any>;


const handler = (items: KVS<any>, workerId: number): any => {
  // console.table(items);
};


beforeAll(() => {
  client = createClient();
  kvs = new RedisKvs<{ value: number }>(client, 'test-kvs');
});


describe('RedisKvs.iterateItems()', () => {

  beforeAll(async () => {
    client = createClient();
    kvs = new RedisKvs<{ value: number }>(client, 'test-kvs');
    await fetchMockData(kvs);
  });

  test('works as expected', async () => {
    const numWorkers = 3;

    const len = await kvs.len();
    const mockHandler = jest.fn(handler);

    await kvs.iterateItems(1, mockHandler);

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

  });
});
