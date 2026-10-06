import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import * as logger from './Logger.js'
import { publicIpv4 } from 'public-ip'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { Agent } from 'https'
import { createHash } from 'crypto'

interface BucketParams {
  Bucket: string
  Key: string
}

// S3 (and S3-compatible) object keys are capped at 1024 bytes. Our cache keys are derived from
// scraped URLs (see stripHttpFromUrl() callers in Downloader.ts), which can exceed that limit on
// their own once percent-encoded (e.g. long, non-Latin Wikimedia Commons filenames plus query
// params). Keep a safety margin below the hard limit for the separator/hash suffix below.
const MAX_S3_KEY_BYTES = 1024
const KEY_HASH_SUFFIX_LENGTH = 65 // '-' + 64 hex chars (sha256 digest)

// Deterministically shrinks a key that is too long for S3 down to a safe, unique length.
// Must be applied the same way to every key before it is used, so that a key computed while
// uploading a blob always matches the key computed while looking it up again later.
export function toSafeS3Key(key: string): string {
  if (Buffer.byteLength(key, 'utf8') <= MAX_S3_KEY_BYTES) {
    return key
  }

  const hash = createHash('sha256').update(key, 'utf8').digest('hex')

  // Keep a human-readable prefix (useful when browsing the bucket) as long as it fits alongside
  // the hash. Trim by character (not by raw byte) so we never split a multi-byte UTF-8 sequence
  // in the middle, re-measuring the UTF-8 byte length on each iteration.
  let prefix = key
  while (Buffer.byteLength(prefix, 'utf8') > MAX_S3_KEY_BYTES - KEY_HASH_SUFFIX_LENGTH) {
    prefix = prefix.slice(0, -1)
  }

  return `${prefix}-${hash}`
}
class S3 {
  public url: any
  public params: URLSearchParams
  public s3Handler: any
  public bucketName: string
  private region: string
  private reqTimeout: number
  private insecure: boolean

  constructor(s3Url: any, s3Params: URLSearchParams, reqTimeout: number, insecure: boolean) {
    this.url = s3Url
    this.params = s3Params
    this.bucketName = s3Params.get('bucketName')
    this.reqTimeout = reqTimeout
    this.insecure = insecure
    this.setRegion()
  }

  private setRegion(): void {
    const url: any = new URL(this.url)
    const regionRegex = /^s3\.([^.]+)/
    const match = url.hostname.match(regionRegex)

    if (match && match[1]) {
      this.region = match[1]
    } else {
      throw new Error('Unknown S3 region set')
    }
  }

  public async initialise() {
    const s3UrlBase: any = new URL(this.url)
    this.s3Handler = new S3Client({
      credentials: {
        accessKeyId: this.params.get('keyId'),
        secretAccessKey: this.params.get('secretAccessKey'),
      },
      endpoint: s3UrlBase.href,
      forcePathStyle: s3UrlBase.protocol === 'http:',
      region: this.region,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: this.reqTimeout,
        requestTimeout: this.reqTimeout,
        httpAgent: new Agent({ keepAlive: true }),
        httpsAgent: new Agent({ keepAlive: true, rejectUnauthorized: !this.insecure }), // rejectUnauthorized: false disables TLS
      }),
    })

    return this.bucketExists(this.bucketName)
      .then(() => true)
      .catch(async () => {
        throw new Error(`
        Unable to connect to S3, either S3 login credentials are wrong or bucket cannot be found
                            Bucket used: ${this.bucketName}
                            End point used: ${s3UrlBase.href}
                            Public IP used: ${await publicIpv4()}
        `)
      })
  }

  public bucketExists(bucket: string): Promise<any> {
    const command = new HeadBucketCommand({ Bucket: bucket })
    return new Promise((resolve, reject) => {
      this.s3Handler.send(command, (err: any) => {
        return err ? reject(err) : resolve(true)
      })
    })
  }

  public uploadBlob(key: string, data: any, eTag: string, version: string): Promise<any> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: toSafeS3Key(key),
      Metadata: { etag: eTag, version },
      Body: data,
    })

    return new Promise((resolve, reject) => {
      this.s3Handler
        .send(command)
        .then((response: any) => {
          resolve(response)
        })
        .catch((err: any) => {
          logger.error('Cache error while uploading object:', err)
          reject(err)
        })
    })
  }

  public downloadBlob(key: string, version = '1'): Promise<any> {
    const command = new GetObjectCommand({ Bucket: this.bucketName, Key: toSafeS3Key(key) })

    return new Promise((resolve, reject) => {
      this.s3Handler
        .send(command)
        .then((response: any) => {
          if (response) {
            const { Metadata } = response
            if (Metadata?.version !== version) {
              Metadata.etag = undefined
            }
            resolve(response)
          } else reject()
        })
        .catch((err: any) => {
          // For 404 error handle AWS service-specific exception
          if (err && err.name === 'NoSuchKey') {
            logger.debug(`The specified key '${key}' does not exist in the cache.`)
            resolve(null)
          } else {
            logger.error(`Error (${err}) while downloading the object '${key}' from the cache.`)
            reject(err)
          }
        })
    })
  }

  // Only for testing purpose
  public deleteBlob(params: BucketParams): Promise<any> {
    const command = new DeleteObjectCommand(params)
    return new Promise((resolve, reject) => {
      this.s3Handler
        .send(command)
        .then((val: any) => resolve(val))
        .catch((err: any) => {
          logger.error('Error while deleting object in the cache', err)
          reject(err)
        })
    })
  }
}

export default S3
