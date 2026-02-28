import * as logger from '../Logger.js'
import * as fs from 'fs'
import crypto from 'crypto'

export function parseCustomCssUrls(rawValue: string): string[] {
  if (!rawValue) {
    return []
  }

  const result: string[] = []

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
        logger.warn(`Skipping invalid CSS URL [${trimmed}]: unsupported protocol`)
        continue
      }
    } catch {
      logger.warn(`Skipping invalid CSS URL [${trimmed}]`)
      continue
    }

    if (result.includes(trimmed)) {
      logger.log(`Ignoring duplicate CSS URL [${trimmed}]`)
      continue
    }

    result.push(trimmed)
  }

  return result
}

export function customCssUrlToFilename(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const basename = pathname.split('/').pop() || 'custom_style'
    const stem = basename.replace(/\.css$/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
    const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 8)
    return `${hash}_${stem}`
  } catch {
    return 'custom_style'
  }
}
