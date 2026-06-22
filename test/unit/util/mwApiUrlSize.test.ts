import { trimPageTitlesBatch } from '../../../src/util/mw-api.js'

function titlesParamSize(batch: string[]): number {
  return new URLSearchParams({ titles: batch.join('|') }).toString().length
}

const MAX_TITLES_PARAM_SIZE = 7400

describe('trimPageTitlesBatch — URL size trimming (issue #2705)', () => {
  test('ASCII batch of 50 titles fits within limit', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `Page_${i}`)
    const batch = trimPageTitlesBatch(ids as PageTitle[])

    expect(batch.length).toBe(50)
    expect(batch[0]).toBe('Page_0')
    expect(batch[49]).toBe('Page_49')
    expect(titlesParamSize(batch)).toBeLessThanOrEqual(MAX_TITLES_PARAM_SIZE)
  })

  test('Arabic titles: all 50 fit within limit', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `مقاله_عربی_طویل_${i}`)
    const batch = trimPageTitlesBatch(ids as PageTitle[])

    expect(batch.length).toBe(50)
    expect(batch[0]).toBe('مقاله_عربی_طویل_0')
    expect(batch[49]).toBe('مقاله_عربی_طویل_49')
    expect(titlesParamSize(batch)).toBeLessThanOrEqual(MAX_TITLES_PARAM_SIZE)
  })

  test('Chinese titles: all 50 fit within limit', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `文章标题测试内容_${i}`)
    const batch = trimPageTitlesBatch(ids as PageTitle[])

    expect(batch.length).toBe(50)
    expect(batch[0]).toBe('文章标题测试内容_0')
    expect(batch[49]).toBe('文章标题测试内容_49')
    expect(titlesParamSize(batch)).toBeLessThanOrEqual(MAX_TITLES_PARAM_SIZE)
  })

  test('Cyrillic titles: all 50 fit within limit', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `Статья_на_русском_языке_${i}`)
    const batch = trimPageTitlesBatch(ids as PageTitle[])

    expect(batch.length).toBe(50)
    expect(batch[0]).toBe('Статья_на_русском_языке_0')
    expect(batch[49]).toBe('Статья_на_русском_языке_49')
    expect(titlesParamSize(batch)).toBeLessThanOrEqual(MAX_TITLES_PARAM_SIZE)
  })

  test('Arabic long titles: batch is trimmed and stays within limit', () => {
    const ids = Array.from({ length: 15 }, (_, i) => 'أ'.repeat(100) + `_${i}`)
    const batch = trimPageTitlesBatch(ids as PageTitle[])

    expect(batch.length).toBeLessThan(ids.length)
    expect(batch.length).toBe(12)
    expect(batch[0]).toBe('أ'.repeat(100) + '_0')
    expect(batch[11]).toBe('أ'.repeat(100) + '_11')
    expect(titlesParamSize(batch)).toBeLessThanOrEqual(MAX_TITLES_PARAM_SIZE)
  })

  test('Mixed Latin and non-Latin titles: all 50 fit within limit', () => {
    const ids = [...Array.from({ length: 25 }, (_, i) => `Page_${i}`), ...Array.from({ length: 25 }, (_, i) => `مقاله_${i}`)]
    const batch = trimPageTitlesBatch(ids as PageTitle[])

    expect(batch.length).toBe(50)
    expect(batch[0]).toBe('Page_0')
    expect(batch[49]).toBe('مقاله_24')
    expect(titlesParamSize(batch)).toBeLessThanOrEqual(MAX_TITLES_PARAM_SIZE)
  })

  test('titles with URLSearchParams-special chars like ( ) are sized correctly', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `Page_(topic_${i})`)
    const batch = trimPageTitlesBatch(ids as PageTitle[])

    expect(batch.length).toBe(50)
    expect(batch[0]).toBe('Page_(topic_0)')
    expect(batch[49]).toBe('Page_(topic_49)')
    expect(titlesParamSize(batch)).toBeLessThanOrEqual(MAX_TITLES_PARAM_SIZE)
  })

  test('never trims to an empty batch even with a single oversized title', () => {
    const ids = ['أ'.repeat(200)]
    const batch = trimPageTitlesBatch(ids as PageTitle[])

    expect(batch.length).toBe(1)
  })

  test('does not mutate the input array', () => {
    const ids = Array.from({ length: 50 }, (_, i) => 'أ'.repeat(100) + `_${i}`)
    const originalLength = ids.length
    const batch = trimPageTitlesBatch(ids as PageTitle[])

    expect(batch.length).toBeLessThan(ids.length)
    expect(ids.length).toBe(originalLength)
  })

  test('respects MAX_BATCH_SIZE cap of 50 even with small titles', () => {
    const ids = Array.from({ length: 100 }, (_, i) => `A_${i}`)
    const batch = trimPageTitlesBatch(ids as PageTitle[])

    expect(batch.length).toBe(50)
  })
})
