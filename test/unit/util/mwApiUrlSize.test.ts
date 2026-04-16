/**
 * Unit tests for the URL-size trimming logic inside getArticlesByIds().
 *
 * We extract and replicate the trimming algorithm here so we can test it
 * without needing Redis, a live wiki, or any network access.
 *
 * Issue: https://github.com/openzim/mwoffliner/issues/2705
 */

const MAX_BATCH_SIZE = 50
const MAX_TITLES_QUERY_SIZE = 7900

/**
 * Identical trimming logic to what lives in getArticlesByIds().
 * Returns the trimmed batch that would be sent in one API request.
 */
function trimBatch(articleIds: string[]): string[] {
  const batch = articleIds.slice(0, MAX_BATCH_SIZE)
  while (batch.length > 1 && encodeURIComponent(batch.join('|')).length > MAX_TITLES_QUERY_SIZE) {
    batch.pop()
  }
  return batch
}

/** Simulated URL size for the titles portion of a batch. */
function simulatedUrlLength(batch: string[]): number {
  return encodeURIComponent(batch.join('|')).length
}

describe('getArticlesByIds — URL size trimming (issue #2705)', () => {
  test('ASCII batch of 50 titles fits within MAX_URL_SIZE', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `Article_${i}`)
    const batch = trimBatch(ids)

    expect(batch.length).toBe(50)
    expect(simulatedUrlLength(batch)).toBeLessThanOrEqual(MAX_TITLES_QUERY_SIZE)
  })

  test('Arabic titles: trimmed batch within URL limit', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `مقاله_عربی_طویل_${i}`)
    const batch = trimBatch(ids)

    expect(simulatedUrlLength(batch)).toBeLessThanOrEqual(MAX_TITLES_QUERY_SIZE)
    expect(batch.length).toBeGreaterThanOrEqual(1)
  })

  test('Chinese titles: trimmed batch within URL limit', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `文章标题测试内容_${i}`)
    const batch = trimBatch(ids)

    expect(simulatedUrlLength(batch)).toBeLessThanOrEqual(MAX_TITLES_QUERY_SIZE)
    expect(batch.length).toBeGreaterThanOrEqual(1)
  })

  test('Cyrillic titles (Russian Wikipedia): trimmed batch within URL limit', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `Статья_на_русском_языке_${i}`)
    const batch = trimBatch(ids)

    expect(simulatedUrlLength(batch)).toBeLessThanOrEqual(MAX_TITLES_QUERY_SIZE)
    expect(batch.length).toBeGreaterThanOrEqual(1)
  })

  test('Mixed Latin and non-Latin titles: trimmed batch within URL limit', () => {
    const ids = [
      ...Array.from({ length: 25 }, (_, i) => `Article_${i}`),
      ...Array.from({ length: 25 }, (_, i) => `مقاله_${i}`),
    ]
    const batch = trimBatch(ids)

    expect(simulatedUrlLength(batch)).toBeLessThanOrEqual(MAX_TITLES_QUERY_SIZE)
    expect(batch.length).toBeGreaterThanOrEqual(1)
  })

  test('never trims to an empty batch (at least 1 title always kept)', () => {
    // Even a single absurdly long title should not be popped to zero
    const ids = ['أ'.repeat(200)]
    const batch = trimBatch(ids)

    expect(batch.length).toBeGreaterThanOrEqual(1)
  })
})
