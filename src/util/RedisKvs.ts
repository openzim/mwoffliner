import { RedisClient } from 'redis';
import { mapLimit } from 'promiso';
import { cpus } from 'os';
import { keepAlive } from './misc';

export class RedisKvs<T> {
    private redisClient: RedisClient;
    private dbName: string;
    private keyMapping?: { [key: string]: string };
    private invertedKeyMapping?: { [key: string]: string };

    private pendingScan: Promise<{ cursor: string, items: Array<[string, string]> }> = Promise.resolve({} as any);

    constructor(redisClient: RedisClient, dbName: string, keyMapping?: { [key: string]: string }) {
        this.redisClient = redisClient;
        this.dbName = dbName;
        this.keyMapping = keyMapping;
        if (keyMapping) {
            this.invertedKeyMapping = Object.entries(keyMapping).reduce((acc, [key, val]) => ({ ...acc, [val]: key }), {});
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
        return mapLimit(
            prop,
            cpus().length * 4,
            (key: string) => {
                return new Promise((resolve, reject) => {
                    this.redisClient.hexists(this.dbName, key, (err, val) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ [key]: val });
                        }
                    });
                });
            },
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
            this.redisClient.hmset(this.dbName, normalisedVal as string, (err, val) => {
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

    public async iterateItems(numWorkers: number, func: (items: KVS<T>, workerId: number) => Promise<void>) {
        let hasLooped = false;

        let scanCursor = '0';
        let pendingScan: Promise<{ cursor: string, items: Array<[string, string]> }> = Promise.resolve(null);

        const workers = ','.repeat(numWorkers - 1).split(',').map((_, i) => i);
        await mapLimit(
            workers,
            numWorkers,
            async (workerId) => {
                while (true) {
                    pendingScan = pendingScan.then(() => {
                        return this.scan(scanCursor)
                            .then(({ cursor, items }) => {
                                scanCursor = cursor;
                                return { cursor, items };
                            });
                    });
                    const { cursor, items } = await pendingScan;

                    if (hasLooped) { // Must be after the await
                        return;
                    }

                    if (cursor === '0') {
                        hasLooped = true;
                    }

                    const parsedItems: KVS<T> = items.reduce((acc, [key, strVal]) => {
                        return {
                            ...acc,
                            [key]: this.mapKeysGet(JSON.parse(strVal)),
                        };
                    }, {} as KVS<T>);

                    keepAlive(); // TODO: remove from here (this is not generic)
                    await func(parsedItems, workerId);
                }
            },
        );
    }

    public scan(scanCursor: string) {
        const retPromise = this.pendingScan.then(() => {
            return new Promise<{ cursor: string, items: Array<[string, string]> }>((resolve, reject) => {
                this.redisClient.hscan(this.dbName, scanCursor, (err, val) => {
                    if (err) {
                        reject(err);
                    } else {
                        const items = val[1].reduce((acc, item, index, arr) => {
                            if (index % 2 === 0) {
                                acc.push([item, arr[index + 1]]);
                                return acc;
                            } else {
                                return acc;
                            }
                        }, []);
                        resolve({
                            cursor: val[0],
                            items,
                        });
                    }
                });
            });
        });
        this.pendingScan = retPromise;
        return retPromise;
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
                        return { ...acc, [newKey]: val };
                    } else {
                        return { ...acc, [key]: val };
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
                        return { ...acc, [newKey]: val };
                    } else {
                        return { ...acc, [key]: val };
                    }
                }, {});
        }
        return mappedVal;
    }
}
