import AWS from 'aws-sdk';
import fs, { readFileSync } from 'fs';
import * as path from 'path';

const wasabiAwsUrl : any = new AWS.Endpoint('s3.us-east-1.wasabisys.com');
const s3WasabiConfig = new AWS.S3({
  endpoint : wasabiAwsUrl,
  accessKeyId: "SJGJT2C2H0WM6S1744W1",
  secretAccessKey: "oNiEt0YfmZ4IShJBlU7XJu0EmWXtcDwdoKsmQZAC"
});

export async function uploadImage(url: string){
    var filePath = url;
    var params = {
        Bucket: 'poler',
        Key: path.basename(filePath),
        Body: fs.createReadStream(filePath)
    };

    var options = {
        partSize: 10 * 1024 * 1024, // 10 MB
        queueSize: 10
    };

    s3WasabiConfig.upload(params, options, function (err, data) {
        if (!err) {
            console.log(data); // successful response
        } else {
            console.log(err); // an error occurred
        }
    });
}

export default{
    uploadImage
}
