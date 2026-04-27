/**
 * Unit tests for trimArticleBatch() in mw-api.ts.
 *
 * Tests import the real exported function so that any regression in
 * production code is immediately caught here.
 *
 * Issue: https://github.com/openzim/mwoffliner/issues/2705
 */

import { trimArticleBatch } from '../../../src/util/mw-api.js'

/** Mirrors how buildQueryURL encodes the titles parameter. */
function titlesParamSize(batch: string[]): number {
  return new URLSearchParams({ titles: batch.join('|') }).toString().length
}

const MAX_TITLES_PARAM_SIZE = 7400

describe('trimArticleBatch — URL size trimming (issue #2705)', () => {
  test('ASCII batch of 50 titles fits within limit', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `Article_${i}`)
    const batch = trimArticleBatch(ids)

    expect(batch.length).toBe(50)
    expect(titlesParamSize(batch)).toBeLessThanOrEqual(MAX_TITLES_PARAM_SIZE)
  })

  test('Arabic titles: trimmed batch stays within limit', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `مقاله_عربی_طویل_${i}`)
    const batch = trimArticleBatch(ids)

    expect(titlesParamSize(batch)).toBeLessThanOrEqual(MAX_TITLES_PARAM_SIZE)
    expect(batch.length).toBeGreaterThanOrEqual(1)
  })

  test('Chinese titles: trimmed batch stays within limit', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `文章标题测试内容_${i}`)
    const batch = trimArticleBatch(ids)

    expect(titlesParamSize(batch)).toBeLessThanOrEqual(MAX_TITLES_PARAM_SIZE)
    expect(batch.length).toBeGreaterThanOrEqual(1)
  })

  test('Cyrillic titles: trimmed batch stays within limit', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `Статья_на_русском_языке_${i}`)
    const batch = trimArticleBatch(ids)

    expect(titlesParamSize(batch)).toBeLessThanOrEqual(MAX_TITLES_PARAM_SIZE)
    expect(batch.length).toBeGreaterThanOrEqual(1)
  })

  test('Mixed Latin and non-Latin titles: trimmed batch stays within limit', () => {
    const ids = [
      ...Array.from({ length: 25 }, (_, i) => `Article_${i}`),
      ...Array.from({ length: 25 }, (_, i) => `مقاله_${i}`),
    ]
    const batch = trimArticleBatch(ids)

    expect(titlesParamSize(batch)).toBeLessThanOrEqual(MAX_TITLES_PARAM_SIZE)
    expect(batch.length).toBeGreaterThanOrEqual(1)
  })

  test('titles with URLSearchParams-special chars like ( ) ! are sized correctly', () => {
    // encodeURIComponent leaves these as 1 byte; URLSearchParams encodes them as 3 bytes.
    // This is the encoding mismatch the bug was about — tests must use URLSearchParams too.
    const ids = Array.from({ length: 50 }, (_, i) => `Article_(topic_${i})`)
    const batch = trimArticleBatch(ids)

    expect(titlesParamSize(batch)).toBeLessThanOrEqual(MAX_TITLES_PARAM_SIZE)
    expect(batch.length).toBeGreaterThanOrEqual(1)
  })

  test('never trims to an empty batch even with a single oversized title', () => {
    const ids = ['أ'.repeat(200)]
    const batch = trimArticleBatch(ids)

    expect(batch.length).toBeGreaterThanOrEqual(1)
  })

  test('does not mutate the input array', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `مقاله_عربی_طویل_${i}`)
    const originalLength = ids.length
    trimArticleBatch(ids)

    expect(ids.length).toBe(originalLength)
  })

  test('respects MAX_BATCH_SIZE cap of 50 even with small titles', () => {
    const ids = Array.from({ length: 100 }, (_, i) => `A_${i}`)
    const batch = trimArticleBatch(ids)

    expect(batch.length).toBeLessThanOrEqual(50)
  })
})