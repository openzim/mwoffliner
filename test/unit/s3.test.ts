import test from 'blue-tape';
import tapePromise from 'tape-promise';
import S3 from '../../src/util/s3';
import logger from 'src/Logger';
import 'dotenv/config';

const _test = tapePromise(test);

_test('s3 checks', async(t) => {
    const credentialExists = await S3.initialiseS3Config(process.env.BASE_URL_TEST, {
        bucketName: process.env.BUCKET_NAME_TEST,
        keyId: process.env.KEY_ID_TEST,
        secretAccessKey: process.env.SECRET_ACCESS_KEY_TEST,
    });

    t.equals(credentialExists, true, 'Credentials on s3 exists');

    const bucketExists = S3.bucketExists(process.env.BUCKET_NAME_TEST);
    t.assert(!!bucketExists, 'Given bucket exists in s3');

    const bucketNotExists = S3.bucketExists('random-string');
    t.rejects(bucketNotExists, 'Given bucket does not exists in s3');

    const imageExist = await S3.existsInS3('https://bm.wikipedia.org/static/images/project-logos/bmwiki.png');
    t.assert(!!imageExist, 'Image exists in s3');
    // Checking the data related to image matches
    t.equals(imageExist.headers.Metadata.etag, '"41ed-52e0629e4f6a7"', 'Etag matches');
    t.equals(imageExist.headers.ContentLength, 7721, 'Content Length matches');
    t.equals(imageExist.headers.ContentType, 'image/png', 'Content Type matches');
    t.equals(imageExist.headers.VersionId, '001580629672761821359-i_kTLp7jqh', 'Version matches');

    const imageNotExist = S3.existsInS3('https://bm.wikipedia.org/static/images/project-logos/polsjsshsgd.png');
    t.rejects(imageNotExist, 'Image doesnt exist in s3');
});
