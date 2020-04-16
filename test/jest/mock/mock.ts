import sg from './sg.json';
import type {RedisKvs} from '../../../src/util/RedisKvs';

export const fetchMockData = async (kvs: RedisKvs<any>): Promise<void> => {
  Object.values(sg).map((item) => {
    kvs.set(item.n, item);
  });
};
