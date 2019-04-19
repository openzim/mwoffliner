import redis, { RedisClient } from 'redis';

export class RedisKvs<T> {
    private redisClient: RedisClient;
    private dbName: string;

    constructor(redisClient: RedisClient, dbName: string) {
        this.redisClient = redisClient;
        this.dbName = dbName;
    }

    public get(prop: string) {
        return new Promise<T>((resolve, reject) => {
            this.redisClient.hget(this.dbName, prop, (err, val) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(JSON.parse(val));
                }
            });
        });
    }

    public set(prop: string, val: T) {
        return new Promise((resolve, reject) => {
            const normalisedVal = typeof val !== 'string' ? JSON.stringify(val) : val;
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
                    acc[key] = typeof val !== 'string' ? JSON.stringify(val) : val;
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

    public async iterateItems(func: (items: Array<[string, T]>, index: number, percentageProgress: number) => Promise<void>) {
        let cursor = '0';
        let index = 0;
        const len = await this.len();

        while (true) {
            const { cursor: nextCursor, items } = await this.hscan(cursor);
            cursor = nextCursor;
            index += items.length;
            const percentageProgress = Math.round(index / len * 1000) / 10;

            const parsedItems: Array<[string, T]> = items.map(([key, strVal]) => [key, JSON.parse(strVal)]);

            await func(parsedItems, index, percentageProgress);

            if (cursor === '0') {
                break;
            }
        }
    }

    public hscan(cursor: string = '0') {
        return new Promise<{ cursor: string, items: Array<[string, string]> }>((resolve, reject) => {
            this.redisClient.hscan(this.dbName, cursor, (err, val) => {
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
}
