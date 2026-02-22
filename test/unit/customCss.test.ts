import { parseCustomCssUrls, customCssUrlToFilename } from '../../src/util/customCss.js'

describe('parseCustomCssUrls', () => {
  test('parses comma-separated URLs', () => {
    const result = parseCustomCssUrls('https://example.com/a.css,https://example.com/b.css')
    expect(result).toEqual(['https://example.com/a.css', 'https://example.com/b.css'])
  })

  test('trims whitespace from URLs', () => {
    const result = parseCustomCssUrls('  https://example.com/a.css , https://example.com/b.css  ')
    expect(result).toEqual(['https://example.com/a.css', 'https://example.com/b.css'])
  })

  test('removes duplicate URLs', () => {
    const result = parseCustomCssUrls('https://example.com/a.css,https://example.com/a.css')
    expect(result).toEqual(['https://example.com/a.css'])
  })

  test('skips invalid URLs', () => {
    const result = parseCustomCssUrls('invalid-url,https://example.com/valid.css')
    expect(result).toEqual(['https://example.com/valid.css'])
  })

  test('skips non-http(s) protocols', () => {
    const result = parseCustomCssUrls('ftp://example.com/style.css,https://example.com/valid.css')
    expect(result).toEqual(['https://example.com/valid.css'])
  })

  test('ignores empty values', () => {
    const result = parseCustomCssUrls('https://example.com/a.css,,https://example.com/b.css,')
    expect(result).toEqual(['https://example.com/a.css', 'https://example.com/b.css'])
  })

  test('returns empty array for empty string', () => {
    expect(parseCustomCssUrls('')).toEqual([])
  })

  test('returns empty array for null/undefined', () => {
    expect(parseCustomCssUrls(null as any)).toEqual([])
    expect(parseCustomCssUrls(undefined as any)).toEqual([])
  })
})

describe('customCssUrlToFilename', () => {
  test('extracts filename from URL', () => {
    expect(customCssUrlToFilename('https://example.com/path/bootstrap.min.css')).toBe('bootstrap.min')
  })

  test('strips .css extension', () => {
    expect(customCssUrlToFilename('https://example.com/style.css')).toBe('style')
  })

  test('sanitizes the special characters', () => {
    expect(customCssUrlToFilename('https://example.com/my%20style.css')).toBe('my_20style')
  })

  test('handle URL with no path', () => {
    expect(customCssUrlToFilename('https://example.com/')).toBe('custom_style')
  })

  test('handles invalid URL gracefully', () => {
    expect(customCssUrlToFilename('not-a-url')).toBe('custom_style')
  })

  test('handles deeply nested paths', () => {
    expect(customCssUrlToFilename('https://cdn.example.com/assets/css/v2/theme.css')).toBe('theme')
  })

  test('handles filename without extension', () => {
    expect(customCssUrlToFilename('https://example.com/stylesheet')).toBe('stylesheet')
  })
})
