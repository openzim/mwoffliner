import test from 'blue-tape';
import tapePromise from 'tape-promise';
import S3 from '../../src/S3';
import logger from 'src/Logger';
import 'dotenv/config';

const _test = tapePromise(test);

_test('S3 checks', async(t) => {
    if (!process.env.BUCKET_NAME_TEST) {
        logger.log('Skip S3 tests');
        return;
    }

    const s3 = new S3(process.env.BASE_URL_TEST, {
        bucketName: process.env.BUCKET_NAME_TEST,
        keyId: process.env.KEY_ID_TEST,
        secretAccessKey: process.env.SECRET_ACCESS_KEY_TEST,
    });

    const credentialExists = await s3.initialise();
    t.equals(credentialExists, true, 'Credentials on S3 exists');

    const bucketExists = s3.bucketExists(process.env.BUCKET_NAME_TEST);
    t.assert(!!bucketExists, 'Given bucket exists in S3');

    const bucketNotExists = s3.bucketExists('random-string');
    t.rejects(bucketNotExists, 'Given bucket does not exists in S3');

    await s3.uploadBlob('bm.wikipedia.org/static/images/project-logos/bmwiki-test.png', '42', '42', '1');
    t.assert(true, 'Image uploaded to S3');

    const imageExist = await s3.downloadBlob('bm.wikipedia.org/static/images/project-logos/bmwiki-test.png');
    t.assert(!!imageExist, 'Image exists in S3');

    const imageNotExist = await s3.downloadBlob('bm.wikipedia.org/static/images/project-logos/polsjsshsgd.png');
    t.equals(imageNotExist, undefined, 'Image doesnt exist in S3');
});
