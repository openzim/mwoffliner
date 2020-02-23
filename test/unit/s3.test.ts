import test from 'blue-tape';
import tapePromise from 'tape-promise';
import S3 from '../../src/util/s3';
import logger from 'src/Logger';
import 'dotenv/config';

const _test = tapePromise(test);

_test('s3 checks', async(t) => {
    const credentialExists = await S3.initialise(process.env.BASE_URL_TEST, {
        bucketName: process.env.BUCKET_NAME_TEST,
        keyId: process.env.KEY_ID_TEST,
        secretAccessKey: process.env.SECRET_ACCESS_KEY_TEST,
    });

    t.equals(credentialExists, true, 'Credentials on s3 exists');

    const bucketExists = S3.bucketExists(process.env.BUCKET_NAME_TEST);
    t.assert(!!bucketExists, 'Given bucket exists in s3');

    const bucketNotExists = S3.bucketExists('random-string');
    t.rejects(bucketNotExists, 'Given bucket does not exists in s3');

    const imageExist = await S3.checkStatusAndDownload('https://bm.wikipedia.org/static/images/project-logos/bmwiki-2x.png');
    t.assert(!!imageExist, 'Image exists in s3');
    // Checking the data related to image matches
    t.equals(imageExist.headers.Metadata.etag, '"aeff-54a391a807034"', 'Etag matches');
    t.equals(imageExist.headers.ContentLength, 19655, 'Content Length matches');
    t.equals(imageExist.headers.ContentType, 'application/octet-stream', 'Content Type matches');

    const imageNotExist = await S3.checkStatusAndDownload('https://bm.wikipedia.org/static/images/project-logos/polsjsshsgd.png');
    t.equals(imageNotExist, undefined, 'Image doesnt exist in s3');
});
