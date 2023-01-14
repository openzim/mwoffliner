import S3 from '../../src/S3.js';
import 'dotenv/config.js';
import {jest} from '@jest/globals';

jest.setTimeout(60000);

const describeIf = process.env.BUCKET_NAME_TEST ? describe : describe.skip;

describeIf('S3', () => {

  test('S3 checks', async () => {

    const s3 = new S3(process.env.BASE_URL_TEST, {
      bucketName: process.env.BUCKET_NAME_TEST,
      keyId: process.env.KEY_ID_TEST,
      secretAccessKey: process.env.SECRET_ACCESS_KEY_TEST,
    });

    const credentialExists = await s3.initialise();
    // Credentials on S3 exists
    expect(credentialExists).toBeTruthy()

    const bucketExists = s3.bucketExists(process.env.BUCKET_NAME_TEST as string);
    // Given bucket exists in S3
    expect(bucketExists).toBeDefined()

    const bucketNotExists = s3.bucketExists('random-string');
    // Given bucket does not exists in S3
    expect(bucketNotExists).toBeDefined()

    // Image uploaded to S3
    await s3.uploadBlob('bm.wikipedia.org/static/images/project-logos/bmwiki-test.png', '42', '42', '1');

    const imageExist = await s3.downloadBlob('bm.wikipedia.org/static/images/project-logos/bmwiki-test.png');
    // Image exists in S3
    expect(imageExist).toBeDefined()

    const imageNotExist = await s3.downloadBlob('bm.wikipedia.org/static/images/project-logos/polsjsshsgd.png');
    // Image doesnt exist in S3
    expect(imageNotExist).toBeNull()
  });
});
