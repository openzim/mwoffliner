import { getSizeFromUrl, truncateUtf8Bytes, truncateZimEntryTitleWords } from '../../../src/util/misc.js'

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

  const truncateZimEntryTitleWordsCases = [
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
  test.each(truncateZimEntryTitleWordsCases)('truncateZimEntryTitleWords', (...args) => {
    const [value, expected] = args as [string, string | undefined]
    expect(truncateZimEntryTitleWords(value)).toBe(expected || value)
  })

  const getSizeFromUrlWidthCases = [
    ['https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/396px-foo.png/60px-396px-foo.png', 60],
    ['https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/foo.jpg/60px-foo.jpg', 60],
    ['https://upload.wikimedia.org/wikipedia/commons/foo.webp/250px-foo.webp', 250],
    ['https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/foo-250px.jpg/60px-foo-250px.jpg', 60],
  ]
  test.each(getSizeFromUrlWidthCases)('getSizeFromUrl width', (url, expectedWidth) => {
    expect(getSizeFromUrl(url as string)).toEqual({ mult: undefined, width: expectedWidth })
  })

  const getSizeFromUrlMultCases = [
    ['https://upload.wikimedia.org/wikipedia/commons/foo-2x.png', 2],
    ['https://upload.wikimedia.org/wikipedia/commons/foo-1.5x.png', 1.5],
    ['https://upload.wikimedia.org/wikipedia/commons/12x-foo-1.5x.png', 1.5],
  ]
  test.each(getSizeFromUrlMultCases)('getSizeFromUrl mult', (url, expectedMult) => {
    expect(getSizeFromUrl(url as string)).toEqual({ mult: expectedMult, width: undefined })
  })

  test('getSizeFromUrl returns empty object when neither width nor mult can be detected', () => {
    expect(getSizeFromUrl('https://upload.wikimedia.org/wikipedia/commons/foo.png')).toEqual({ mult: undefined, width: undefined })
  })
})
