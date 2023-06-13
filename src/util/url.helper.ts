import * as urlParser from 'url'

class URLHelper {
  private readonly urlPartCache: KVS<string> = {}

  public serializeUrl(url: string): string {
    const { path } = urlParser.parse(url)
    const cacheablePart = url.replace(path, '')
    const cacheEntry = Object.entries(this.urlPartCache).find(([, value]) => value === cacheablePart)
    let cacheKey
    if (!cacheEntry) {
      const cacheId = String(Object.keys(this.urlPartCache).length + 1)
      this.urlPartCache[cacheId] = cacheablePart
      cacheKey = `_${cacheId}_`
    } else {
      cacheKey = `_${cacheEntry[0]}_`
    }
    return `${cacheKey}${path}`
  }

  public deserializeUrl(url: string): string {
    if (!url.startsWith('_')) return url
    const [, cacheId, ...pathParts] = url.split('_')
    const path = pathParts.join('_')
    const cachedPart = this.urlPartCache[cacheId]
    return `${cachedPart}${path}`
  }
}

const urlHelper = new URLHelper()

export default urlHelper
