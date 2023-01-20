import S3 from '../../src/S3.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'
import urlParser from 'url'

jest.setTimeout(60000)

const describeIf = process.env.S3_URL ? describe : describe.skip
describeIf('S3', () => {
  test('S3 checks', async () => {
    const s3UrlObj = urlParser.parse(`${process.env.S3_URL}`, true)

    const s3 = new S3(`${s3UrlObj.protocol}//${s3UrlObj.host}/`, {
      bucketName: s3UrlObj.query.bucketName,
      keyId: s3UrlObj.query.keyId,
      secretAccessKey: s3UrlObj.query.secretAccessKey,
    })

    const credentialExists = await s3.initialise()
    // Credentials on S3 exists
    expect(credentialExists).toBeTruthy()

    const bucketExists = await s3.bucketExists(s3UrlObj.query.bucketName as string)
    // Given bucket exists in S3
    expect(bucketExists).toBeDefined()

    // Given bucket does not exists in S3
    await expect(s3.bucketExists('random-string')).rejects.toThrowError()

    const s3TestKey = `bm.wikipedia.org/static/images/project-logos/${Math.random().toString(36).slice(2, 7)}.png`
    // Image uploaded to S3
    await s3.uploadBlob(s3TestKey, '42', '42', 'image/png', '1')

    const imageExist = await s3.downloadBlob(s3TestKey)
    // Image exists in S3
    expect(imageExist).toBeDefined()

    // Remove Image after test
    await s3.deleteBlob({ Bucket: s3UrlObj.query.bucketName, Key: s3TestKey })

    const imageNotExist = await s3.downloadBlob('bm.wikipedia.org/static/images/project-logos/polsjsshsgd.png')
    // Image doesnt exist in S3
    expect(imageNotExist).toBeNull()
  })
})
