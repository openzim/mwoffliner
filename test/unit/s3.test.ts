import S3 from '../../src/S3.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'

jest.setTimeout(60000)

const describeIf = process.env.S3_URL ? describe : describe.skip
describeIf('S3', () => {
  test('S3 checks', async () => {
    const s3UrlObj = new URL(`${process.env.S3_URL}`)

    const s3 = new S3(
      `${s3UrlObj.protocol}//${s3UrlObj.host}/`,
      new URLSearchParams({
        bucketName: s3UrlObj.searchParams.get('bucketName'),
        keyId: s3UrlObj.searchParams.get('keyId'),
        secretAccessKey: s3UrlObj.searchParams.get('secretAccessKey'),
      }),
      1000 * 60,
      false,
    )

    const credentialExists = await s3.initialise()
    // Credentials on S3 exists
    expect(credentialExists).toBeTruthy()

    const bucketExists = await s3.bucketExists(s3UrlObj.searchParams.get('bucketName') as string)
    // Given bucket exists in S3
    expect(bucketExists).toBeDefined()

    // Given bucket does not exists in S3
    await expect(s3.bucketExists('random-string')).rejects.toThrowError()

    const s3TestKey = `bm.wikipedia.org/static/images/project-logos/${Math.random().toString(36).slice(2, 7)}.png`
    // Image uploaded to S3
    await s3.uploadBlob(s3TestKey, '42', '42', '1')

    const imageExist = await s3.downloadBlob(s3TestKey)
    // Image exists in S3
    expect(imageExist).toBeDefined()

    // Remove Image after test
    await s3.deleteBlob({ Bucket: s3UrlObj.searchParams.get('bucketName') as string, Key: s3TestKey })

    const imageNotExist = await s3.downloadBlob('bm.wikipedia.org/static/images/project-logos/polsjsshsgd.png')
    // Image doesnt exist in S3
    expect(imageNotExist).toBeNull()
  })

  test('Test whether the wrong region was set', async () => {
    const wrongS3UrlObj = new URL('https://wrong-s3.region.com/?keyId=123&secretAccessKey=123&bucketName=kiwix')

    expect(
      () =>
        new S3(
          `${wrongS3UrlObj.protocol}//${wrongS3UrlObj.host}/`,
          new URLSearchParams({
            bucketName: wrongS3UrlObj.searchParams.get('bucketName'),
            keyId: wrongS3UrlObj.searchParams.get('keyId'),
            secretAccessKey: wrongS3UrlObj.searchParams.get('secretAccessKey'),
          }),
          1000 * 60,
          false,
        ),
    ).toThrow('Unknown S3 region set')
  })
})
