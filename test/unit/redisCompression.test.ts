import RedisKvs from '../../src/util/RedisKvs.js'
import RedisStore from '../../src/RedisStore.js'
import { startRedis, stopRedis } from './bootstrap.js'

describe('RedisKvs Compression Mapping (ArticleDetail)', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  const mapping = {
    s: 'subCategories',
    c: 'categories',
    p: 'pages',
    h: 'thumbnail',
    g: 'coordinates',
    t: 'timestamp',
    r: 'revisionId',
    i: 'internalThumbnailUrl',
    m: 'missing',
    n: 'title',
  }

  test('compression -> decompression is lossless (full object)', async () => {
    const kvs = new RedisKvs<any>(RedisStore.client, 'article-test', mapping)

    const input = {
      title: 'London',
      categories: [{ title: 'City' }],
      subCategories: [{ title: 'Capital cities' }],
      revisionId: 123,
      coordinates: '51.5074,0.1278',
      thumbnail: { source: 'img.jpg', height: 200, width: 200 },
      timestamp: '2024-01-01',
      internalThumbnailUrl: 'internal.jpg',
      pages: [{ title: 'Page1' }],
    }
    await kvs.set('London', input)
    const result = await kvs.get('London')
    expect(result).toEqual(input)
  })

  test('handles missing optional fields correctly', async () => {
    const kvs = new RedisKvs<any>(RedisStore.client, 'article-test-2', mapping)
    const input = {
      title: 'Paris',
      revisionId: 456,
    }
    await kvs.set('Paris', input)

    const result = await kvs.get('Paris')
    expect(result.title).toBe('Paris')
    expect(result.revisionId).toBe(456)

    // optional fields should NOT magically appear
    expect(result.categories).toBeUndefined()
    expect(result.thumbnail).toBeUndefined()
  })

  test('handles "missing" flag correctly', async () => {
    const kvs = new RedisKvs<any>(RedisStore.client, 'article-test-3', mapping)
    const input = {
      title: 'FakeArticle',
      missing: true,
    }

    await kvs.set('FakeArticle', input)
    const result = await kvs.get('FakeArticle')
    expect(result.missing).toBe(true)
  })

  test('empty object does not break compression', async () => {
    const kvs = new RedisKvs<any>(RedisStore.client, 'article-test-4', mapping)
    await kvs.set('Empty', {})
    const result = await kvs.get('Empty')
    expect(result).toEqual({})
  })

  test('overwrite maintains correct mapping', async () => {
    const kvs = new RedisKvs<any>(RedisStore.client, 'article-test-5', mapping)
    await kvs.set('London', { title: 'Old', revisionId: 1 })
    await kvs.set('London', {
      title: 'New',
      revisionId: 999,
      categories: [{ title: 'Updated' }],
    })

    const result = await kvs.get('London')
    expect(result.title).toBe('New')
    expect(result.revisionId).toBe(999)
    expect(result.categories?.[0]?.title).toBe('Updated')
  })
})
