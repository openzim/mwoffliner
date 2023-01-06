import data from './sg.json';
import type {RedisKvs} from '../../../src/util/RedisKvs.js';

export const initMockData = async (kvs: RedisKvs<any>, size?: number): Promise<void> => {
  const len = Object.keys(data).length;
  const multiplier = (size ?? len) / len;

  for (let i = 0; i < multiplier; i++) {
    const d: Array<{ n: string; r: number; t: string; }> = [];
    Object.values(data).forEach((item, x) => {
      d.push({...item, n: `${data[x].n}_${i}`});
    });
    await kvs.setMany(d);
  }
};