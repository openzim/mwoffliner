import { truncateUtf8Bytes, truncateZimArticleTitleWords } from '../../../src/util/misc.js'

describe('miscelenaous utility functions tests', () => {
  const truncateUtf8BytesCases = [
    ['foo', 100, 'foo'],
    ['foo', 1, 'f'],
    ['fÖo', 1, 'f'],
    ['fÖo', 2, 'f'],
    ['fÖo', 3, 'fÖ'],
    ['fÖo', 4, 'fÖo'],
  ]
  test.each(truncateUtf8BytesCases)('truncateUtf8Bytes', (...args) => {
    const [value, length, expected] = args as [string, number, string]
    expect(truncateUtf8Bytes(value, length)).toBe(expected)
  })

  const MAX_WORD_LENGTH = 240

  const truncateZimArticleTitleWordsCases = [
    ['f'.repeat(MAX_WORD_LENGTH), undefined],
    ['f'.repeat(MAX_WORD_LENGTH + 1), 'f'.repeat(MAX_WORD_LENGTH)],
    [`${'f'.repeat(MAX_WORD_LENGTH)} ${'f'.repeat(MAX_WORD_LENGTH)}`, undefined],
    [
      `${'a'.repeat(MAX_WORD_LENGTH)} ${'b'.repeat(MAX_WORD_LENGTH + 1)} ${'c'.repeat(MAX_WORD_LENGTH + 1)} ${'d'.repeat(MAX_WORD_LENGTH)}`,
      `${'a'.repeat(MAX_WORD_LENGTH)} ${'b'.repeat(MAX_WORD_LENGTH)} ${'c'.repeat(MAX_WORD_LENGTH)} ${'d'.repeat(MAX_WORD_LENGTH)}`,
    ],
    [`${'f'.repeat(MAX_WORD_LENGTH - 2)}Ö`, undefined],
    [`${'f'.repeat(MAX_WORD_LENGTH - 1)}Ö`, 'f'.repeat(MAX_WORD_LENGTH - 1)],
  ]
  test.each(truncateZimArticleTitleWordsCases)('truncateZimArticleTitleWords', (...args) => {
    const [value, expected] = args as [string, string | undefined]
    expect(truncateZimArticleTitleWords(value)).toBe(expected || value)
  })
})
