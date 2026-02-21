import { parseCustomCssUrls, customCssUrlToFilename } from '../../src/util/customCss.js'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('parseCustomCssUrls', () => {
  let tempFilePath: string
  let tempMixedFilePath: string

  beforeAll(() => {
    tempFilePath = path.join(os.tmpdir(), `test-custom-css-${Date.now()}.csv`)
    fs.writeFileSync(tempFilePath, 'https://example.com/file1.css\nhttps://example.com/file2.css\nhttps://example.com/file3.css\n  \n')

    tempMixedFilePath = path.join(os.tmpdir(), `test-custom-css-mixed-${Date.now()}.csv`)
    // mix  of lines, spaces, trailing and commas
    fs.writeFileSync(tempMixedFilePath, 'https://example.com/a.css\n\n  https://example.com/b.css  , https://example.com/c.css ,\nhttps://example.com/d.css\n\n')
  })

  afterAll(() => {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath)
    }
    if (fs.existsSync(tempMixedFilePath)) {
      fs.unlinkSync(tempMixedFilePath)
    }
  })

  test('reads URLs from local file', () => {
    const result = parseCustomCssUrls(tempFilePath)
    expect(result).toEqual(['https://example.com/file1.css', 'https://example.com/file2.css', 'https://example.com/file3.css'])
  })

  test('reads heavily mixed formats from local file', () => {
    const result = parseCustomCssUrls(tempMixedFilePath)
    expect(result).toEqual(['https://example.com/a.css', 'https://example.com/b.css', 'https://example.com/c.css', 'https://example.com/d.css'])
  })

  test('parses comma-separated URLs', () => {
    const result = parseCustomCssUrls('https://example.com/a.css,https://example.com/b.css')
    expect(result).toEqual(['https://example.com/a.css', 'https://example.com/b.css'])
  })

  test('trims whitespace from URLs', () => {
    const result = parseCustomCssUrls('  https://example.com/a.css , https://example.com/b.css  ')
    expect(result).toEqual(['https://example.com/a.css', 'https://example.com/b.css'])
  })

  test('throws on duplicate URLs', () => {
    expect(() => parseCustomCssUrls('https://example.com/a.css,https://example.com/a.css')).toThrow(/Duplicate CSS URL/)
  })

  test('throws on invalid URLs and lists all errors', () => {
    expect(() => parseCustomCssUrls('invalid-url,also-invalid,https://example.com/valid.css')).toThrow(/Invalid CSS URL.*Invalid CSS URL/s)
  })

  test('throws on non-http(s) protocols', () => {
    expect(() => parseCustomCssUrls('ftp://example.com/style.css')).toThrow(/unsupported protocol/)
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
  test('extracts filename from URL with hash prefix', () => {
    expect(customCssUrlToFilename('https://example.com/path/bootstrap.min.css')).toBe('3ab65b35_bootstrap.min.css')
  })

  test('add .css suffix even when original has one', () => {
    expect(customCssUrlToFilename('https://example.com/style.css')).toBe('8d1c8eb9_style.css')
  })

  test('add .css suffix when original has no extension', () => {
    expect(customCssUrlToFilename('https://example.com/stylesheet')).toBe('92361343_stylesheet.css')
  })

  test('sanitizes special characters', () => {
    expect(customCssUrlToFilename('https://example.com/my%20style.css')).toBe('8c0df9dc_my_20style.css')
  })

  test('handles URLs with no meaningful path using fallback stem', () => {
    expect(customCssUrlToFilename('https://example.com/')).toBe('182ccedb_custom_style.css')
  })

  test('handles deeply nested paths', () => {
    expect(customCssUrlToFilename('https://cdn.example.com/assets/css/v2/theme.css')).toBe('faf87e3a_theme.css')
  })

  test('returns unique filenames for different URLs with same basename', () => {
    const a = customCssUrlToFilename('https://cdn1.example.com/style.css')
    const b = customCssUrlToFilename('https://cdn2.example.com/style.css')
    expect(a).not.toEqual(b)
  })
})
