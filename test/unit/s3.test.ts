import S3, { toSafeS3Key } from '../../src/S3.js'
import 'dotenv/config.js'
import { jest } from '@jest/globals'

jest.setTimeout(60000)

describe('toSafeS3Key', () => {
  test('leaves keys within the 1024-byte S3 limit untouched', () => {
    const key = 'bm.wikipedia.org/static/images/project-logos/wiki.png'
    expect(toSafeS3Key(key)).toBe(key)
  })

  test('shrinks a key exceeding the limit to 1024 bytes or fewer', () => {
    // Mirrors the real-world failure in https://github.com/openzim/mwoffliner/issues/2917:
    // a percent-encoded, non-Latin Wikimedia Commons thumbnail URL (plus query params) that
    // is 1026 bytes once protocol-stripped, 2 bytes over S3's hard 1024-byte key limit.
    const cyrillicSegment = '%D0%9F%D0%B0%D0%BC%D1%8F%D1%82%D0%BD%D0%B8%D0%BA_%D0%93%D0%B5%D1%80%D0%BE%D1%8E'
    const longKey =
      `thumb.wikimedia.org/wikipedia/commons/thumb/c/ce/${cyrillicSegment}.jpg/` +
      `250px-${cyrillicSegment}.jpg?utm_source=ru.wikipedia.org&utm_campaign=parser&utm_content=thumbnail-${'x'.repeat(900)}`

    expect(Buffer.byteLength(longKey, 'utf8')).toBeGreaterThan(1024)

    const safeKey = toSafeS3Key(longKey)

    expect(Buffer.byteLength(safeKey, 'utf8')).toBeLessThanOrEqual(1024)
    expect(safeKey).not.toBe(longKey)
  })

  test('is deterministic, so the same oversized key always maps to the same safe key', () => {
    const longKey = `a/very/long/cache/key/${'segment-'.repeat(200)}.jpg`

    expect(toSafeS3Key(longKey)).toBe(toSafeS3Key(longKey))
  })

  test('maps different oversized keys to different safe keys', () => {
    const longKeyA = `a/very/long/cache/key/${'segment-a-'.repeat(200)}.jpg`
    const longKeyB = `a/very/long/cache/key/${'segment-b-'.repeat(200)}.jpg`

    expect(toSafeS3Key(longKeyA)).not.toBe(toSafeS3Key(longKeyB))
  })

  test('does not split a multi-byte UTF-8 character when trimming the prefix', () => {
    // Every character here is a 2-byte UTF-8 sequence; a byte-oriented (rather than
    // character-oriented) trim could cut one in half and produce invalid UTF-8.
    const longKey = 'ü'.repeat(600)

    const safeKey = toSafeS3Key(longKey)

    expect(Buffer.byteLength(safeKey, 'utf8')).toBeLessThanOrEqual(1024)
    expect(Buffer.from(safeKey, 'utf8').toString('utf8')).toBe(safeKey)
  })
})

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
    await expect(s3.bucketExists('random-string')).rejects.toThrow()

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
