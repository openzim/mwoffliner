import test from 'blue-tape';
import Axios from 'axios';
import S3 from '../../src/util/s3';

test('s3 checks', async(t)=>{
    const credentialExists = S3.initialiseS3Config('s3.us-west-1.wasabisys.com/', {
        bucketName: 'mwoffliner',
        keyId: 'SJGJT2C2H0WM6S1744W1',
        secretAccessKey: 'oNiEt0YfmZ4IShJBlU7XJu0EmWXtcDwdoKsmQZAC' }
      );
    t.ok(credentialExists, 'Login Success for s3');

    const imageExist = S3.existsInS3('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.png');
    t.ok(imageExist, 'Image already exists check positive');
})