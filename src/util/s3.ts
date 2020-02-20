import S3File from 'aws-sdk';
import * as path from 'path';
import logger from '../Logger';
import axios from 'axios';
import { Readable } from 'stream';

let s3Config: any;
let bucketName: string;

export async function initialiseS3Config(url: string, params: any) {
    const s3UrlBase: any = new S3File.Endpoint(url);
    s3Config = new S3File.S3({
        endpoint: s3UrlBase,
        accessKeyId: params.keyId,
        secretAccessKey: params.secretAccessKey,
    });
    try {
        if (await bucketExists(params.bucketName) === true) {
            bucketName = params.bucketName;
            return true;
        }
    } catch (err) {
        return err;
    }
}

export async function bucketExists(bucket: string): Promise<any> {
    const param = {
        Bucket: bucket,
    };
    return new Promise(( resolve, reject ) => {
        s3Config.headBucket(param, function(err: any, data: any) {
            if ( err ) { reject(err);
            } else { resolve(true); }
        });
    });
}

function bufferToStream(binary: Buffer) {
    return new Readable({
      read() {
        this.push(binary);
        this.push(null);
      },
    });
}

export async function uploadBlob(imageResp: any, filepath: string) {
    logger.log(`Uploading [${filepath}] to S3`);
    let options;
    const params = {
        Bucket: bucketName,
        Key: path.basename(filepath),
        Metadata: {etag: imageResp.headers.etag },
        Body: bufferToStream(imageResp.data),
    };
    if (!imageResp['content-length']) {
        options = {
            partSize: 10 * 1024 * 1024,
            queueSize: 1,
        };
    }
    try {
        s3Config.upload( params, options, function (err: any, data: any) {
            if (data) {
                // logger.log(`Uploaded [${filepath}]`);
            } else {
                logger.log(`Not able to upload ${filepath}:`, err);
            }
        });
    } catch (err) {
        logger.log('S3 ERROR', err);
    }
}

export async function checkStatusAndDownload(filepath: string): Promise<any> {
    const params = {
        Bucket: bucketName,
        Key: path.basename(filepath),
    };

    return new Promise((resolve, reject) => {
        s3Config.getObject(params, async (err: any, val: any) => {
            if (err && err.statusCode === 404) {
                resolve(false);
            } else {
                const valHeaders = (({ Body, ...o }) => o)(val);
                const urlHeaders = await axios.head(filepath);
                // Check if e-tag is in sync
                if (urlHeaders.headers.etag === val.Metadata.etag) {
                    resolve({ headers: valHeaders, imgData: val.Body });
                } else {
                    resolve(false);
                }
            }
        });
    }).catch((err) => {
        return err;
    });
}

// Only for testing purpose
export async function deleteBlob(params: any): Promise<any> {
    return new Promise((resolve, reject) => {
        s3Config.deleteObject(params,  (err: any, val: any) => {
            if (err) { reject(err);
            } else { resolve(val); }
        });
    });
}

export default {
    uploadBlob,
    checkStatusAndDownload,
    initialiseS3Config,
    deleteBlob,
    bucketExists,
};
