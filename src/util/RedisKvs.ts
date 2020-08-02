import {cpus} from 'os';
import pmap from 'p-map';
import fastq from 'fastq';
import * as util from 'util';
import deepmerge from 'deepmerge';
import type {RedisClient} from 'redis';

const chunkSize = 10;
const queueLength: string = '100';


interface ScanResult {
  cursor: string;
  items: string[][];
}


export class RedisKvs<T> {
  private readonly redisClient: RedisClient;
  private readonly hscanAsync: (arg0: string, arg1: string, arg2: string, arg3: string) => Promise<[string, string[]]>;
  private readonly dbName: string;
  private readonly keyMapping?: { [key: string]: string };
  private readonly invertedKeyMapping?: { [key: string]: string };

  constructor(redisClient: RedisClient, dbName: string, keyMapping?: { [key: string]: string }) {
    this.redisClient = redisClient;
    this.hscanAsync = util.promisify(redisClient.hscan).bind(this.redisClient);
    this.dbName = dbName;
    this.keyMapping = keyMapping;
    if (keyMapping) {
      this.invertedKeyMapping = Object.entries(keyMapping).reduce((acc, [key, val]) => ({...acc, [val]: key}), {});
    }
  }

  public get(prop: string) {
    return new Promise<T>((resolve, reject) => {
      this.redisClient.hget(this.dbName, prop, (err, val) => {
        if (err) {
          reject(err);
        } else {
          const d = JSON.parse(val);
          const mappedVal = this.mapKeysGet(d);
          resolve(mappedVal);
        }
      });
    });
  }

  public getMany(prop: string[]) {
    return new Promise<KVS<T>>((resolve, reject) => {
      this.redisClient.hmget(this.dbName, prop, (err, val) => {
        if (err) {
          reject(err);
        } else {
          resolve(
            val
              .map((a) => JSON.parse(a))
              .reduce((acc, val, index) => {
                return {
                  ...acc,
                  [prop[index]]: this.mapKeysGet(val),
                };
              }, {} as KVS<T>),
          );
        }
      });
    });
  }

  public exists(prop: string[]): Promise<{ [key: string]: number }> {
    return pmap(
      prop,
      (key: string) => {
        return new Promise((resolve, reject) => {
          this.redisClient.hexists(this.dbName, key, (err, val) => {
            if (err) {
              reject(err);
            } else {
              resolve({[key]: val});
            }
          });
        });
      },
      {concurrency: cpus().length * 4}
    ).then((vals: any[]) => vals.reduce((acc, val) => Object.assign(acc, val), {}));
  }

  public set(prop: string, val: T) {
    return new Promise((resolve, reject) => {
      const valToSet = this.mapKeysSet(val);
      this.redisClient.hset(this.dbName, prop, RedisKvs.normalize(valToSet), (err, val) => {
        if (err) {
          reject(err);
        } else {
          resolve(val);
        }
      });
    });
  }

  public setMany(val: KVS<T>) {
    return new Promise((resolve, reject) => {
      const numKeys = Object.keys(val).length;
      if (!numKeys) {
        resolve();
        return;
      }
      this.redisClient.hmset(this.dbName, this.normalizeMany(val), (err, val) => {
        if (err) {
          reject(err);
        } else {
          resolve(val);
        }
      });
    });
  }

  public async addMany(items: KVS<T>, idsToKeep: string[] = []) {
    if (idsToKeep.length === 0) idsToKeep = Object.keys(items);
    const itemsToKeep = await this.getMany(idsToKeep);
    await this.setMany(
      deepmerge(
        itemsToKeep,
        items
      ),
    );
  }

  public delete(prop: string) {
    return new Promise((resolve, reject) => {
      this.redisClient.hdel(this.dbName, prop, (err, val) => {
        if (err) {
          reject(err);
        } else {
          resolve(val);
        }
      });
    });
  }

  public deleteMany(prop: string[]) {
    return new Promise((resolve, reject) => {
      this.redisClient.hdel(this.dbName, prop.join(' '), (err, val) => {
        if (err) {
          reject(err);
        } else {
          resolve(val);
        }
      });
    });
  }

  public keys() {
    return new Promise<string[]>((resolve, reject) => {
      this.redisClient.hkeys(this.dbName, (err, val) => {
        if (err) {
          reject(err);
        } else {
          resolve(val);
        }
      });
    });
  }

  public len() {
    return new Promise<number>((resolve, reject) => {
      this.redisClient.hlen(this.dbName, (err, val) => {
        if (err) {
          reject(err);
        } else {
          resolve(val);
        }
      });
    });
  }

  public async iterateItems(numWorkers: number, func: (key: string, value: T) => Promise<any>): Promise<string[]> {
    const len = await this.len();
    if (len === 0) return [];

    const ids: any[] = [];  // for testing purposes
    const iterator = this.scanAsync();
    let processed = 0;

    return new Promise(async (resolve) => {
      const fetch = async (): Promise<void> => {
        const data = await iterator.next();
        if (data.done) return;

        // todo types
        // @ts-ignore
        for (const item of data.value) {
          q.push({item, func}, (e, id) => {
            processed++;
            if (process.env.NODE_ENV === 'test') ids.push(id);
            if (processed === len) return resolve(ids);
          });
        }
      };

      const q = fastq(this.worker, numWorkers);
      q.empty = fetch;
      q.drain = fetch;

      await fetch();
    });
  }


  private worker = async ({item, func}: { item: KeyValue<T>, func: (key: string, value: T) => Promise<any> }, cb: any): Promise<void> => {
    const id = item[0];
    const entity = item[1];
    try {
      await func(id, entity);
      cb(null, process.env.NODE_ENV === 'test' ? id : undefined);
    } catch (e) {
      console.error(e);
      cb(e)
    }
  };

  public async * scanAsync(): AsyncGenerator<KeyValue<T>[], void, unknown> {
    let cursor = '0';
    do {
      const data = await this.hscanAsync(this.dbName, cursor, 'COUNT', queueLength);
      cursor = data[0];
      const items = Array
        .from(data[1], (x, k) => k % 2 ? undefined : [x, this.mapKeysGet(JSON.parse(data[1][k + 1]))])
        .filter((x: T[]) => x);

      // todo
      // @ts-ignore
      if (items.length > 0) yield items;
    } while (cursor !== '0')
  }

  public scan(scanCursor: string, count: string = '10'): Promise<ScanResult> {
    return new Promise<ScanResult>((resolve, reject) => {
      this.redisClient.hscan(this.dbName, scanCursor, 'COUNT', count, (err, [cursor, data]) => {
        if (err) return reject(err);
        // extract the items from Redis response
        const items = Array.from(data, (x, k) => k % 2 ? undefined : [x, data[k + 1]]).filter((x) => x);
        resolve({cursor, items});
      });
    });
  }

  public flush() {
    return new Promise<void>((resolve, reject) => {
      this.redisClient.del(this.dbName, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private mapKeysGet(obj: any): T {
    let mappedVal = obj;
    if (obj && this.keyMapping && typeof obj === 'object') {
      mappedVal = Object.entries(obj)
        .reduce((acc, [key, val]) => {
          if (this.keyMapping[key]) {
            const newKey = this.keyMapping[key];
            return {...acc, [newKey]: val};
          } else {
            return {...acc, [key]: val};
          }
        }, {});
    }
    return mappedVal;
  }

  private mapKeysSet(obj: any): T {
    let mappedVal = obj;
    if (obj && this.invertedKeyMapping && typeof obj === 'object') {
      mappedVal = Object.entries(obj)
        .reduce((acc, [key, val]) => {
          if (this.invertedKeyMapping[key]) {
            const newKey = this.invertedKeyMapping[key];
            return {...acc, [newKey]: val};
          } else {
            return {...acc, [key]: val};
          }
        }, {});
    }
    return mappedVal;
  }

  private normalizeMany(val: KVS<any>): KVS<string> {
    return Object.entries(val)
      .reduce((acc: KVS<string>, [key, val]) => {
        const newVal = this.mapKeysSet(val);
        acc[key] = RedisKvs.normalize(newVal);
        return acc;
      }, {});
  }

  private static normalize(val: any): string {
    return typeof val !== 'string' ? JSON.stringify(val) : val as string;
  }
}
