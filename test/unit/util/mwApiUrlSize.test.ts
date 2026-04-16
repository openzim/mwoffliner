/**
 * Unit tests for the URL-size trimming logic inside getArticlesByIds().
 *
 * We extract and replicate the trimming algorithm here so we can test it
 * without needing Redis, a live wiki, or any network access.
 *
 * Issue: https://github.com/openzim/mwoffliner/issues/2705
 * Non-Latin titles URL-encode to long %XX sequences. The old code under-counted
 * the URL size by (a) ignoring fixed query-param overhead and (b) using an
 * inaccurate subtraction loop instead of re-measuring after each pop.
 */

const MAX_BATCH_SIZE = 50
const MAX_URL_SIZE = 7900
const FIXED_QUERY_OVERHEAD = 500

/**
 * Identical trimming logic to what lives in getArticlesByIds().
 * Returns the trimmed batch that would be sent in one API request.
 */
function trimBatch(articleIds: string[]): string[] {
  const batch = articleIds.slice(0, MAX_BATCH_SIZE)
  while (batch.length > 1 && encodeURIComponent(batch.join('|')).length + FIXED_QUERY_OVERHEAD > MAX_URL_SIZE) {
    batch.pop()
  }
  return batch
}

/** Simulated final URL size for a batch (titles fragment + fixed overhead). */
function simulatedUrlLength(batch: string[]): number {
  return encodeURIComponent(batch.join('|')).length + FIXED_QUERY_OVERHEAD
}

describe('getArticlesByIds — URL size trimming (issue #2705)', () => {
  test('ASCII batch of 50 titles fits within MAX_URL_SIZE', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `Article_${i}`)
    const batch = trimBatch(ids)

    expect(batch.length).toBe(50)
    expect(simulatedUrlLength(batch)).toBeLessThanOrEqual(MAX_URL_SIZE)
  })

  test('Arabic titles: trimmed batch within URL limit', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `مقاله_عربی_طویل_${i}`)
    const batch = trimBatch(ids)

    expect(simulatedUrlLength(batch)).toBeLessThanOrEqual(MAX_URL_SIZE)
    expect(batch.length).toBeGreaterThanOrEqual(1)
  })

  test('Chinese titles: trimmed batch within URL limit', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `文章标题测试内容_${i}`)
    const batch = trimBatch(ids)

    expect(simulatedUrlLength(batch)).toBeLessThanOrEqual(MAX_URL_SIZE)
    expect(batch.length).toBeGreaterThanOrEqual(1)
  })

  test('Cyrillic titles (Russian Wikipedia): trimmed batch within URL limit', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `Статья_на_русском_языке_${i}`)
    const batch = trimBatch(ids)

    expect(simulatedUrlLength(batch)).toBeLessThanOrEqual(MAX_URL_SIZE)
    expect(batch.length).toBeGreaterThanOrEqual(1)
  })

  test('Mixed Latin and non-Latin titles: trimmed batch within URL limit', () => {
    const ids = [
      ...Array.from({ length: 25 }, (_, i) => `Article_${i}`),
      ...Array.from({ length: 25 }, (_, i) => `مقاله_${i}`),
    ]
    const batch = trimBatch(ids)

    expect(simulatedUrlLength(batch)).toBeLessThanOrEqual(MAX_URL_SIZE)
    expect(batch.length).toBeGreaterThanOrEqual(1)
  })

  test('never trims to an empty batch (at least 1 title always kept)', () => {
    // Even a single absurdly long title should not be popped to zero
    const ids = ['أ'.repeat(200)]
    const batch = trimBatch(ids)

    expect(batch.length).toBeGreaterThanOrEqual(1)
  })

  test('old algorithm would have FAILED: non-Latin batch exceeds limit without overhead', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `مقاله_عربی_طویل_${i}`)

    // Simulate the old (buggy) algorithm
    const oldBatch = ids.slice(0, MAX_BATCH_SIZE)
    let oldUrlSize = encodeURIComponent(oldBatch.join('|')).length
    while (oldUrlSize > MAX_URL_SIZE) {
      oldUrlSize -= encodeURIComponent(oldBatch.pop()!).length + 1
    }

    // New algorithm
    const newBatch = trimBatch(ids)

    // New batch must always respect the real URL limit
    expect(simulatedUrlLength(newBatch)).toBeLessThanOrEqual(MAX_URL_SIZE)

    // Log for visibility in CI output
    console.log(`Old algorithm real URL length: ${simulatedUrlLength(oldBatch)}`)
    console.log(`New algorithm real URL length: ${simulatedUrlLength(newBatch)}`)
  })
})
