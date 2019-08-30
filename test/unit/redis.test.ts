import './bootstrap.test';
import test from 'blue-tape';
import { RedisKvs } from 'src/util/RedisKvs';
import { redis } from './bootstrap.test';

test('Redis Tests', async (t) => {
    const kvs = new RedisKvs<{ value: number }>(redis.client, 'test-kvs');

    const len = await kvs.len();
    t.equal(len, 0, `New RedisKVS should have 0 items`);

    await kvs.set('testItem1', { value: 1 });
    await kvs.set('testItem2', { value: 2 });
    await kvs.set('testItem3', { value: 3 });
    await kvs.set('testItem4', { value: 4 });

    const newLen = await kvs.len();
    t.equal(newLen, 4, `Can set items`);

    const item2 = await kvs.get('testItem2');
    t.equal(item2.value, 2, `Can get single item`);
    const { testItem1, testItem4 } = await kvs.getMany(['testItem1', 'testItem4']);
    t.equal(testItem1.value, 1, 'Can get multiple items (1/2)');
    t.equal(testItem4.value, 4, 'Can get multiple items (2/2)');

    await kvs.delete('testItem2');
    const deletedTestItem2 = await kvs.get('testItem2');
    t.equal(deletedTestItem2 || null, null, `Can delete single item`);

    await kvs.deleteMany(['testItem1', 'testItem4']);
    const { deletedTestItem1, deletedTestItem4 } = await kvs.getMany(['testItem1', 'testItem4']);
    t.equal(deletedTestItem1 || null, null, `Can delete multiple items (1/2)`);
    t.equal(deletedTestItem4 || null, null, `Can delete multiple items (2/2)`);

    await kvs.flush();

    const flushedLen = await kvs.len();
    t.equal(flushedLen, 0, `Can flush KVS`);
});
