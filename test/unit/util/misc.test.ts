import { truncateUtf8Bytes } from '../../../src/util/misc.js'

describe('miscelenaous utility functions tests', () => {
  const cases = [
    ['foo', 100, 'foo'],
    ['foo', 1, 'f'],
    ['fÖo', 1, 'f'],
    ['fÖo', 2, 'f'],
    ['fÖo', 3, 'fÖ'],
    ['fÖo', 4, 'fÖo'],
  ]
  test.each(cases)('truncateUtf8Bytes', (value: string, length: number, expected: string) => {
    expect(truncateUtf8Bytes(value, length)).toBe(expected)
  })
})
