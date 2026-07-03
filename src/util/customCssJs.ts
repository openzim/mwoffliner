import * as fs from 'fs'
import crypto from 'crypto'

export function parseCustomJsUrls(rawValue: string): string[] {
  return parseCustomUrls(rawValue, 'JS', '--customJs')
}

export function parseCustomCssUrls(rawValue: string): string[] {
  return parseCustomUrls(rawValue, 'CSS', '--customCss')
}

export function parseCustomUrls(rawValue: string, kind: string, cliParameter: string): string[] {
  if (!rawValue) {
    return []
  }

  const result: string[] = []
  const errors: string[] = []

  const parts = String(rawValue)
    .split(',')
    .filter((n) => n)
    .map((part) => {
      let item: string | string[] = part.trim()
      if (fs.existsSync(item)) {
        item = fs
          .readFileSync(item, 'utf-8')
          .split(/[\n,]/)
          .map((a) => a.replace(/\r/gm, '').trim())
          .filter((a) => a)
      }
      return item
    })
    .flat(1)

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) {
      continue
    }

    try {
      const url = new URL(trimmed)
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push(`Invalid ${kind} URL [${trimmed}]: unsupported protocol [${url.protocol}]`)
        continue
      }
    } catch {
      errors.push(`Invalid ${kind} URL [${trimmed}]: not a valid URL`)
      continue
    }

    if (result.includes(trimmed)) {
      errors.push(`Duplicate ${kind} URL [${trimmed}]`)
      continue
    }

    result.push(trimmed)
  }

  if (errors.length > 0) {
    throw new Error(`${cliParameter} has invalid entries:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
  }

  return result
}

export function customJsUrlToFilename(url: string): string {
  return customUrlToFilename(url, 'custom_script', /\.js$/, '.js')
}

export function customCssUrlToFilename(url: string): string {
  return customUrlToFilename(url, 'custom_style', /\.css$/, '.css')
}

export function customUrlToFilename(url: string, default_path: string, filename_regex: RegExp, filename_suffix: string): string {
  const pathname = new URL(url).pathname
  const basename = pathname.split('/').pop() || default_path
  const stem = basename.replace(filename_regex, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 8)
  return `${hash}_${stem}${filename_suffix}`
}
