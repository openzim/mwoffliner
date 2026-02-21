import * as logger from '../Logger.js'

export function parseCustomCssUrls(rawValue: string): string[] {
  if (!rawValue) {
    return []
  }
  const seen = new Set<string>()
  const result: string[] = []
  const parts = String(rawValue).split(',')

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
    if (seen.has(trimmed)) {
      logger.log(`Ignoring duplicate CSS URL [${trimmed}]`)
      continue
    }
    seen.add(trimmed)
    result.push(trimmed)
  }

  return result
}

export function customCssUrlToFilename(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const filename = pathname.split('/').pop() || 'custom_style'
    return filename.replace(/\.css$/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  } catch {
    return 'custom_style'
  }
}
