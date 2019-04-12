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
            const normalisedVal = Object.entries(val).reduce((acc: KVS<string>, [key, val]) => {
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

    public flush() {
        return new Promise<void>((resolve, reject) => {
            this.redisClient.hdel(this.dbName, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}
