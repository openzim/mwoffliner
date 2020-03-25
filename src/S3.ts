import S3File from 'aws-sdk';
import logger from './Logger';
import axios from 'axios';
import { Readable } from 'stream';

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
            throw new Error(`Unable to connect to S3, either S3 login credentials are wrong or bucket cannot be found`);
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

    public async downloadIfPossible(upstreamUrl: string, requestUrl: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.s3Handler.getObject({Bucket: this.bucketName, Key: upstreamUrl}, async (err: any, val: any) => {
                if (val) {
                    const valHeaders = (({ Body, ...o }) => o)(val);
                    axios.head(requestUrl).then((urlHeaders) => {
                         // Check if ETag is in sync
                        if (urlHeaders.headers.etag === val.Metadata.etag) {
                            resolve({ headers: valHeaders, imgData: val.Body });
                        } else {
                            resolve();
                        }
                    }).catch((err) => {
                        reject(err);
                    });
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
    public async deleteBlob(params: any): Promise<any> {
        return new Promise((resolve, reject) => {
            this.s3Handler.deleteObject(params,  (err: any, val: any) => {
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
