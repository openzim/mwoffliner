import { jest } from '@jest/globals'

import { CacheStore, buildCacheVersion } from '../../src/CacheStore.js'
import S3 from '../../src/S3.js'

const createFakeS3 = () =>
  ({
    downloadBlob: jest.fn(async () => null),
    uploadBlob: jest.fn(async () => undefined),
  }) as unknown as S3

describe('CacheStore', () => {
  test('is enabled only when an optimisation cache URL is configured', () => {
    expect(new CacheStore().enabled).toBe(false)
    expect(new CacheStore({ optimisationCacheUrl: '' }).enabled).toBe(false)
    expect(new CacheStore({ optimisationCacheUrl: 'https://s3.example.org/bucket' }).enabled).toBe(true)
  })

  test('downloads blobs with the scheme-less URL as key', async () => {
    const s3 = createFakeS3()
    const store = new CacheStore({ optimisationCacheUrl: 'https://s3.example.org/bucket', s3 })

    await store.download('https://upload.wikimedia.org/wikipedia/commons/a.png', 'webp')

    expect(s3.downloadBlob).toHaveBeenCalledWith('upload.wikimedia.org/wikipedia/commons/a.png', 'webp')
  })

  test('uploads blobs with the scheme-less URL as key', async () => {
    const s3 = createFakeS3()
    const store = new CacheStore({ optimisationCacheUrl: 'https://s3.example.org/bucket', s3 })
    const data = Buffer.from('image')

    await store.upload('http://upload.wikimedia.org/wikipedia/commons/a.png', data, 'etag-value', '1-w250')

    expect(s3.uploadBlob).toHaveBeenCalledWith('upload.wikimedia.org/wikipedia/commons/a.png', data, 'etag-value', '1-w250')
  })
})

describe('buildCacheVersion', () => {
  test.each([
    [true, undefined, 'webp'],
    [true, 250, 'webp-w250'],
    [false, undefined, '1'],
    [false, 250, '1-w250'],
  ])('webp=%s and displayWidth=%s produce %s', (webp, displayWidth, expected) => {
    expect(buildCacheVersion(webp, displayWidth)).toBe(expected)
  })
})
