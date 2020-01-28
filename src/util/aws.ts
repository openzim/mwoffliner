import AWS from 'aws-sdk';
import fs, { readFileSync } from 'fs';
import * as path from 'path';
import logger from '../Logger';
import { WASABI_CONFIG } from './const';

const wasabiAwsUrl: any = new AWS.Endpoint(WASABI_CONFIG.ENDPOINT_ZONE);
const s3WasabiConfig = new AWS.S3({
    endpoint: wasabiAwsUrl,
    accessKeyId: WASABI_CONFIG.ACCESS_KEY_ID,
    secretAccessKey: WASABI_CONFIG.SECRET_ACCESS_KEY
});

export async function uploadImage(imagresponse: any, filepath: string) {
    logger.log('MALI  BAMKAO', imagresponse.data)
     fs.writeFile('/tmp/tempFile', imagresponse.data, function () {
        //Need to refactor so that params are not declared again and again
        let params = {
            Bucket: WASABI_CONFIG.BUCKET_NAME,
            ContentType: imagresponse.headers['content-type'],
            ContentLength: imagresponse.headers['content-length'],
            Key: path.basename(filepath),
            Body: fs.createReadStream('/tmp/tempFile')
        };
       
        logger.log('MALI  BAMKAO PUT', params);
        // var options = {
        //     partSize: 10 * 1024 * 1024, // 10 MB
        //     queueSize: 10
        // };
        try{
            logger.log('MALI  BAMKAO PUT TRY');
            s3WasabiConfig.putObject(params, function (err, data) {
                logger.log('MALI  BAMKAO PUT');
                //make the method more generic with just change of s3Obj properties
                if (data) {
                    logger.log('Succefully uploaded the image', data);
                } else {
                    logger.log(`Not able to upload ${filepath}:`, this.httpResponse.body.toString());
                }
            })
        } catch(err){
            logger.log('WASABI ERROR', err);
        }
       
    });

}

export async function checkIfImageAlreadyExistsInAws(filepath: string): Promise<any> {
    let params = {
        Bucket: WASABI_CONFIG.BUCKET_NAME,
        Key: path.basename(filepath)
    }
    try {
        const headCode = await s3WasabiConfig.headObject(params).promise();
        const signedUrl = s3WasabiConfig.getSignedUrl('getObject', params);

        return new Promise((resolve, reject) => {
            const getUrl = s3WasabiConfig.getObject(params, async (err: any, val: any) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({ 'headers': headCode, 'imgData': val.Body });
                }
            });
        });
    }
    catch (err) {

    }
}


export default {
    uploadImage,
    checkIfImageAlreadyExistsInAws
}
