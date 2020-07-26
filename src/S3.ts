import S3File from 'aws-sdk';
import logger from './Logger';
import { Readable } from 'stream';
import publicIp from 'public-ip';

class S3 {
    public url: any;
    public params: any;
    public s3Handler: any;
    public bucketName: string;

    constructor(s3Url: any, s3Params: any) {
        this.url = s3Url;
        this.params = s3Params;
        this.bucketName = s3Params.bucketName;
    }

    public async initialise() {
        const s3UrlBase: any = new S3File.Endpoint(this.url);
        this.s3Handler = new S3File.S3({
            endpoint: s3UrlBase,
            accessKeyId: this.params.keyId,
            secretAccessKey: this.params.secretAccessKey,
        });
        try {
            if (await this.bucketExists(this.bucketName) === true) {
                return true;
            }
        } catch (err) {
            throw new Error(`Unable to connect to S3, either S3 login credentials are wrong or bucket cannot be found
                            Bucket used: ${this.bucketName}
                            End point used: ${s3UrlBase.href}
                            Public IP used: ${await publicIp.v4()}`);
        }
    }

    public async bucketExists(bucket: string): Promise<any> {
        return new Promise(( resolve, reject ) => {
            this.s3Handler.headBucket({Bucket: bucket}, function(err: any) {
                err ? reject(err) : resolve(true);
            });
        });
    }

    public async uploadBlob(key: string, data: any, eTag: string) {
        const params = {
            Bucket: this.bucketName,
            Key: key,
            Metadata: {etag: eTag },
            Body: this.bufferToStream(data),
        };

        try {
            this.s3Handler.upload( params, function (err: any, data: any) {
                if (err) {
                    logger.log(`Not able to upload ${key}: ${err}`);
                }
            });
        } catch (err) {
            logger.log('S3 error', err);
        }
    }

    public async downloadBlob(key: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.s3Handler.getObject({Bucket: this.bucketName, Key: key}, async (err: any, val: any) => {
                if (val) {
                    resolve(val);
                } else if (err && err.statusCode === 404) {
                    resolve();
                } else {
                    reject(err);
                }
            });
        }).catch((err) => {
            return err;
        });
    }

    // Only for testing purpose
    public async deleteBlob(key: any): Promise<any> {
        return new Promise((resolve, reject) => {
            this.s3Handler.deleteObject(key,  (err: any, val: any) => {
                err ? reject(err) : resolve(val);
            });
        });
    }

    private bufferToStream(binary: Buffer) {
        return new Readable({
        read() {
            this.push(binary);
            this.push(null);
        },
        });
    }
}

export default S3;
