import S3 from './S3.js'
import { stripHttpFromUrl } from './util/index.js'

export interface CacheStoreOptions {
  optimisationCacheUrl?: string
  s3?: S3
}

export function buildCacheVersion(webp: boolean, displayWidth?: number): string {
  if (webp) {
    return displayWidth ? `webp-w${displayWidth}` : 'webp'
  }
  return displayWidth ? `1-w${displayWidth}` : '1'
}

export class CacheStore {
  private readonly optimisationCacheUrl: string
  private readonly s3: S3

  constructor({ optimisationCacheUrl, s3 }: CacheStoreOptions = {}) {
    this.optimisationCacheUrl = optimisationCacheUrl
    this.s3 = s3
  }

  get enabled(): boolean {
    return Boolean(this.optimisationCacheUrl)
  }

  public download(url: string, version: string): Promise<any> {
    return this.s3.downloadBlob(stripHttpFromUrl(url), version)
  }

  public upload(url: string, data: Buffer, etag: string, version: string): Promise<any> {
    return this.s3.uploadBlob(stripHttpFromUrl(url), data, etag, version)
  }
}
