import { parseCustomCssUrls, customCssUrlToFilename, parseCustomJsUrls, customJsUrlToFilename } from '../../src/util/customCssJs.js'
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

describe('parseCustomJsUrls', () => {
  let tempFilePath: string
  let tempMixedFilePath: string

  beforeAll(() => {
    tempFilePath = path.join(os.tmpdir(), `test-custom-js-${Date.now()}.csv`)
    fs.writeFileSync(tempFilePath, 'https://example.com/file1.js\nhttps://example.com/file2.js\nhttps://example.com/file3.js\n  \n')

    tempMixedFilePath = path.join(os.tmpdir(), `test-custom-js-mixed-${Date.now()}.csv`)
    // mix  of lines, spaces, trailing and commas
    fs.writeFileSync(tempMixedFilePath, 'https://example.com/a.js\n\n  https://example.com/b.js  , https://example.com/c.js ,\nhttps://example.com/d.js\n\n')
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
    const result = parseCustomJsUrls(tempFilePath)
    expect(result).toEqual(['https://example.com/file1.js', 'https://example.com/file2.js', 'https://example.com/file3.js'])
  })

  test('reads heavily mixed formats from local file', () => {
    const result = parseCustomJsUrls(tempMixedFilePath)
    expect(result).toEqual(['https://example.com/a.js', 'https://example.com/b.js', 'https://example.com/c.js', 'https://example.com/d.js'])
  })

  test('parses comma-separated URLs', () => {
    const result = parseCustomJsUrls('https://example.com/a.js,https://example.com/b.js')
    expect(result).toEqual(['https://example.com/a.js', 'https://example.com/b.js'])
  })

  test('trims whitespace from URLs', () => {
    const result = parseCustomJsUrls('  https://example.com/a.js , https://example.com/b.js  ')
    expect(result).toEqual(['https://example.com/a.js', 'https://example.com/b.js'])
  })

  test('throws on duplicate URLs', () => {
    expect(() => parseCustomJsUrls('https://example.com/a.js,https://example.com/a.js')).toThrow(/Duplicate JS URL/)
  })

  test('throws on invalid URLs and lists all errors', () => {
    expect(() => parseCustomJsUrls('invalid-url,also-invalid,https://example.com/valid.js')).toThrow(/Invalid JS URL.*Invalid JS URL/s)
  })

  test('throws on non-http(s) protocols', () => {
    expect(() => parseCustomJsUrls('ftp://example.com/style.js')).toThrow(/unsupported protocol/)
  })

  test('ignores empty values', () => {
    const result = parseCustomJsUrls('https://example.com/a.js,,https://example.com/b.js,')
    expect(result).toEqual(['https://example.com/a.js', 'https://example.com/b.js'])
  })

  test('returns empty array for empty string', () => {
    expect(parseCustomJsUrls('')).toEqual([])
  })

  test('returns empty array for null/undefined', () => {
    expect(parseCustomJsUrls(null as any)).toEqual([])
    expect(parseCustomJsUrls(undefined as any)).toEqual([])
  })
})

describe('customJsUrlToFilename', () => {
  test('extracts filename from URL with hash prefix', () => {
    expect(customJsUrlToFilename('https://example.com/path/bootstrap.foo.js')).toBe('41e5c8e7_bootstrap.foo.js')
  })

  test('add .js suffix even when original has one', () => {
    expect(customJsUrlToFilename('https://example.com/script.js')).toBe('2f174c5d_script.js')
  })

  test('add .js suffix when original has no extension', () => {
    expect(customJsUrlToFilename('https://example.com/script')).toBe('434ba4d3_script.js')
  })

  test('sanitizes special characters', () => {
    expect(customJsUrlToFilename('https://example.com/my%20script.js')).toBe('4e28c904_my_20script.js')
  })

  test('handles URLs with no meaningful path using fallback stem', () => {
    expect(customJsUrlToFilename('https://example.com/')).toBe('182ccedb_custom_script.js')
  })

  test('handles deeply nested paths', () => {
    expect(customJsUrlToFilename('https://cdn.example.com/assets/js/v2/theme.js')).toBe('c6f9c2be_theme.js')
  })

  test('returns unique filenames for different URLs with same basename', () => {
    const a = customJsUrlToFilename('https://cdn1.example.com/script.js')
    const b = customJsUrlToFilename('https://cdn2.example.com/script.js')
    expect(a).not.toEqual(b)
  })
})
