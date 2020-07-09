import {cpus} from 'os';
import pmap from 'p-map';
import type {RedisClient} from 'redis';


interface ScanResult {
  cursor: string;
  items: string[][];
}


export class RedisKvs<T> {
  private redisClient: RedisClient;
  private readonly dbName: string;
  private readonly keyMapping?: { [key: string]: string };
  private readonly invertedKeyMapping?: { [key: string]: string };

  constructor(redisClient: RedisClient, dbName: string, keyMapping?: { [key: string]: string }) {
    this.redisClient = redisClient;
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
      const normalisedVal = typeof valToSet !== 'string' ? JSON.stringify(valToSet) : valToSet;
      this.redisClient.hset(this.dbName, prop, normalisedVal as string, (err, val) => {
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
      const normalisedVal = Object.entries(val)
        .reduce((acc: KVS<string>, [key, val]) => {
          const newVal = this.mapKeysSet(val);
          acc[key] = typeof newVal !== 'string' ? JSON.stringify(newVal) : newVal;
          return acc;
        }, {});
      this.redisClient.hmset(this.dbName, normalisedVal, (err, val) => {
        if (err) {
          reject(err);
        } else {
          resolve(val);
        }
      });
    });
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

  public async iterateItems(numWorkers: number, func: (items: KVS<T>, workerId: number) => Promise<any>) {

    const workers = Array.from(Array(numWorkers).keys());

    const total = await this.len();
    const chunkSize = 10;

    // ---- time ----------->
    // x         x   x   x
    // 1 ........... 4 ...........
    // 2 ....... 5 ..................
    // 3 ............... 6 ........

    //  0  30  60
    // 10  40  70
    // 20  50  80

    // await this.scan(cursor);

    return await pmap(
      workers,
      async (workerId) => {

        // for testing purposes
        const ids: any[] = [];
        const chunkStat: any = {};

        for (let i = workerId * chunkSize; i <= total; i = i + numWorkers * chunkSize) {
          const {items} = await this.scan(i.toString());
          console.log(`[${workerId}]\t${i}  ->\t${i + chunkSize - 1}\t= ${items.length}`);

          const count = items.length;
          if (!chunkStat[count]) {
            chunkStat[count] = 1;
          } else {
            chunkStat[count]++;
          }

          const parsedItems: KVS<T> = items.reduce((acc, [key, strVal]) => ({
            ...acc,
            [key]: this.mapKeysGet(JSON.parse(strVal)),
          }), {} as KVS<T>);

          for (const item of Object.values(parsedItems)) {
            // @ts-ignore
            ids.push(item.n);
          }

          if (Object.keys(parsedItems).length !== 0) await func(parsedItems, workerId);
        }

        return { ids, chunkStat };
      },
      {concurrency: numWorkers}
    );
  }

  public scan(scanCursor: string): Promise<ScanResult> {
    return new Promise<ScanResult>((resolve, reject) => {
      this.redisClient.hscan(this.dbName, scanCursor, (err, [cursor, data]) => {
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
}
