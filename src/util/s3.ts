import S3File from 'aws-sdk';
import fs, { readFileSync } from 'fs';
import * as path from 'path';
import logger from '../Logger';
import { WASABI_CONFIG } from './const';
import axios from 'axios';

const s3Url: any = new S3File.Endpoint(WASABI_CONFIG.ENDPOINT_ZONE);
const s3Config = new S3File.S3({
    endpoint: s3Url,
    accessKeyId: WASABI_CONFIG.ACCESS_KEY_ID,
    secretAccessKey: WASABI_CONFIG.SECRET_ACCESS_KEY
});

export async function uploadImage(imageResp: any, filepath: string) {
     fs.writeFile('/tmp/tempFile', imageResp.data, function () {
        //Need to refactor so that params are not declared again and again
        let params = {
            Bucket: WASABI_CONFIG.BUCKET_NAME,
            ContentType: imageResp.headers['content-type'],
            ContentLength: imageResp.headers['content-length'],
            Key: path.basename(filepath),
            Metadata: {'etag': imageResp.headers.etag ? imageResp.headers.etag : null},
            Body: fs.createReadStream('/tmp/tempFile')
        };

        try{
            s3Config.putObject(params, function (err, data) {
                if (data) {
                    logger.log('Succefully uploaded the image', data);
                } else {
                    logger.log(`Not able to upload ${filepath}:`, err);
                }
            })
        } catch(err){
            logger.log('S3 ERROR', err);
        }
       
    });

}

export async function existsInS3(filepath: string): Promise<any> {
    let params = {
        Bucket: WASABI_CONFIG.BUCKET_NAME,
        Key: path.basename(filepath)
    }
    try {
        const headCode = await s3Config.headObject(params).promise();
        s3Config.getSignedUrl('getObject', params);

        return new Promise((resolve, reject) => {
            s3Config.getObject(params, async (err: any, val: any) => {
                if (err) {
                    reject(err);
                } else {
                    const urlHeaders = await axios.head(filepath);
                    if(urlHeaders.headers.etag === val.Metadata.etag ){
                        resolve({ 'headers': headCode, 'imgData': val.Body });
                    } else {
                        resolve(false);
                    }
                    
                }
            });
        });
    }
    catch (err) {
        
    }
}

export default {
    uploadImage,
    existsInS3
}
