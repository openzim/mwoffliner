import pall from 'p-all';
import data from './sg.json';
import type { RedisKvs } from '../../../src/util/RedisKvs';


export const initMockData = async (kvs: RedisKvs<any>, size?: number): Promise<number[]> => {
  const len = Object.keys(data).length;
  const multiplier = (size ?? len) / len;
  const result = [];
  const ids: number[] = [];

  for (let i = 0; i < multiplier; i++) {
    for (const item of Object.values(data)) {
      const x = Object.values(data).indexOf(item);
      const n = `${data[x].n}_${i}`;
      ids.push(item.r);
      result.push(() => kvs.set(n, {...item, n }));
    }
  }
  // workaround
  console.time('pall');
  await pall(result, {concurrency: 10});
  console.timeEnd('pall');
  return ids;
};
