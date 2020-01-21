import AWS from 'aws-sdk';
import fs, { readFileSync } from 'fs';
import * as path from 'path';
import logger from '../Logger';

const wasabiAwsUrl : any = new AWS.Endpoint('s3.us-east-1.wasabisys.com');
const s3WasabiConfig = new AWS.S3({
  endpoint : wasabiAwsUrl,
  accessKeyId: "SJGJT2C2H0WM6S1744W1",
  secretAccessKey: "oNiEt0YfmZ4IShJBlU7XJu0EmWXtcDwdoKsmQZAC"
});

export async function uploadImage(imagresponseHeaders: any, filepath: string){
    logger.log('INSIDE CACGING FUNCTION-------------------------------')
    fs.writeFile('/tmp/tempFile',imagresponseHeaders.data, function(){
        let params = {
            Bucket: 'poler',
            ContentType: imagresponseHeaders.headers['content-type'],
            ContentLength: imagresponseHeaders.headers['content-length'],
            Key: path.basename(filepath),
            Body: fs.createReadStream('/tmp/tempFile')
        };
    
        // var options = {
        //     partSize: 10 * 1024 * 1024, // 10 MB
        //     queueSize: 10
        // };
       
        s3WasabiConfig.putObject(params, function(data, err){
            if (!err) {
                logger.log('COMING INSIDE-------SUCCESS', data);
            } else {
                logger.log('COMING INSIDE-------ERROR', err);
            }
        }) 
    });

}

export function checkIfImageAlreadyExistsInAws(filepath: string){
    let params = {
        Bucket:'poler',
        Key: path.basename(filepath)
    }
    logger.log(params);
   
     return s3WasabiConfig.getObject(params, function(err : any, data) : boolean{
        if (err.response && err.response.statusCode === 404) {
            return false;
        } 
        return true;
    }) 

}

export default{
    uploadImage,
    checkIfImageAlreadyExistsInAws
}
