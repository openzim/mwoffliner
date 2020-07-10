import pall from 'p-all';
import data from './sg.json';
import type { RedisKvs } from '../../../src/util/RedisKvs';


export const initMockData = async (kvs: RedisKvs<any>, size?: number): Promise<string[]> => {
  const len = Object.keys(data).length;
  const multiplier = (size ?? len) / len;
  const result = [];
  const ids: string[] = [];
  let cnt: number = 0;

  for (let i = 0; i < multiplier; i++) {
    for (const [key, item] of Object.entries(data)) {
      const x = Object.values(data).indexOf(item);
      const n = `${data[x].n}_${i}`;
      const r = (i + 1) * parseInt(key, 10) * 10000 + item.r;
      ids.push(n);
      result.push(() => kvs.set(n, {...item, n, r}));
      cnt++;
      if (cnt >= size) break;
    }
    if (cnt >= size) break;
  }

  // workaround
  await pall(result, {concurrency: 10});
  return ids;
};
