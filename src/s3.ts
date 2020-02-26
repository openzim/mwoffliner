import S3File from 'aws-sdk';
import * as path from 'path';
import logger from './Logger';
import axios from 'axios';
import { Readable } from 'stream';

class S3 {
    public s3Url: any;
    public s3Params: any;
    public s3Config: any;
    public bucketName: string;

    constructor(s3Url: any, s3Params: any) {
        this.s3Url = s3Url;
        this.s3Params = s3Params;
        this.bucketName = s3Params.bucketName;
    }

    public async initialise() {
        const s3UrlBase: any = new S3File.Endpoint(this.s3Url);
        this.s3Config = new S3File.S3({
            endpoint: s3UrlBase,
            accessKeyId: this.s3Params.keyId,
            secretAccessKey: this.s3Params.secretAccessKey,
        });
        try {
            if (await this.bucketExists(this.bucketName) === true) {
                this.s3Params.bucketName = this.bucketName;
                return true;
            }
        } catch (err) {
            throw new Error(`Unable to connect to S3, either S3 login credentials are wrong or bucket cannot be found`);
        }
    }

    public async bucketExists(bucket: string): Promise<any> {
        const param = {
            Bucket: bucket,
        };
        return new Promise(( resolve, reject ) => {
            this.s3Config.headBucket(param, function(err: any, data: any) {
                if ( err ) { reject(err);
                } else { resolve(true); }
            });
        });
    }

    public async uploadBlob(key: string, data: any, eTag: string) {
        logger.log(`Uploading [${key}] to S3`);
        const params = {
            Bucket: this.bucketName,
            Key: path.basename(key),
            Metadata: {etag: eTag },
            Body: this.bufferToStream(data),
        };

        try {
            this.s3Config.upload( params, function (err: any, data: any) {
                if (data) {
                    // logger.log(`Uploaded [${filepath}]`);
                } else {
                    logger.log(`Not able to upload ${key}: ${err}`);
                }
            });
        } catch (err) {
            logger.log('S3 error', err);
        }
    }

    public async checkStatusAndDownload(filepath: string): Promise<any> {
        const params = {
            Bucket: this.bucketName,
            Key: path.basename(filepath),
        };

        return new Promise((resolve, reject) => {
            this.s3Config.getObject(params, async (err: any, val: any) => {
                if (err && err.statusCode === 404) {
                    resolve();
                } else {
                    const valHeaders = (({ Body, ...o }) => o)(val);
                    const urlHeaders = await axios.head(filepath);
                    // Check if ETag is in sync
                    if (urlHeaders.headers.etag === val.Metadata.etag) {
                        resolve({ headers: valHeaders, imgData: val.Body });
                    } else {
                        resolve();
                    }
                }
            });
        }).catch((err) => {
            return err;
        });
    }

    // Only for testing purpose
    public async deleteBlob(params: any): Promise<any> {
        return new Promise((resolve, reject) => {
            this.s3Config.deleteObject(params,  (err: any, val: any) => {
                if (err) { reject(err);
                } else { resolve(val); }
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
