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

  public iterateItems(
    numWorkers: number,
    func: (items: KVS<T>, runningWorkers: number) => Promise<void>,
  ) {
    return new Promise((resolve, reject) => {
      let runningWorkers = 0;
      let isScanning = false;
      let done = false;
      let isResolved = false;
      let scanCursor = '0';

      const scan = async () => {
        if (runningWorkers >= numWorkers || isScanning || isResolved) {
          return;
        }
        if (done) {
          if (!runningWorkers) {
            isResolved = true;
            resolve();
          }
          return;
        }
        isScanning = true;

        try {
          runningWorkers += 1;
          const { cursor, items } = await this.scan(scanCursor);
          scanCursor = cursor;
          if (scanCursor === '0') {
            done = true;
          }
          const parsedItems: KVS<T> = items.reduce((acc, [key, strVal]) => {
            return {
              ...acc,
              [key]: this.mapKeysGet(JSON.parse(strVal)),
            };
          }, {} as KVS<T>);
          setImmediate(workerFunc, parsedItems);
        } catch(err) {
          if (!isResolved) {
            isResolved = true;
            reject(err);
          }
        }
        isScanning = false;
        setImmediate(scan);
      };

      const workerFunc = async (items: KVS<T>) => {
        try {
          await func(items, runningWorkers);
          runningWorkers -= 1;
          setImmediate(scan);
        } catch(err) {
          if (!isResolved) {
            isResolved = true;
            reject(err);
          }
        }
      };

      scan();
    });
  }

  public scan(scanCursor: string): Promise<ScanResult> {
    return new Promise<ScanResult>((resolve, reject) => {
      this.redisClient.hscan(this.dbName, scanCursor, (err, [cursor, data]) => {
        if (err) return reject(err);
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
