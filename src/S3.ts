import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import * as logger from './Logger.js'
import { Readable } from 'stream'

interface BucketParams {
  Bucket: string
  Key: string
}
class S3 {
  public url: any
  public params: any
  public s3Handler: any
  public bucketName: string
  private region: string

  constructor(s3Url: any, s3Params: any) {
    this.url = s3Url
    this.params = s3Params
    this.bucketName = s3Params.bucketName
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
        accessKeyId: this.params.keyId,
        secretAccessKey: this.params.secretAccessKey,
      },
      endpoint: s3UrlBase.href,
      forcePathStyle: s3UrlBase.protocol === 'http:',
      region: this.region,
    })

    return this.bucketExists(this.bucketName)
      .then(() => true)
      .catch((err) => {
        throw new Error(`Unable to connect to S3: ${err.message}`)
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

  public uploadBlob(key: string, data: any, eTag: string, contentType: string, version: string): Promise<any> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Metadata: { etag: eTag, contenttype: contentType, version },
      Body: this.bufferToStream(data),
    })

    return new Promise((resolve, reject) => {
      this.s3Handler
        .send(command)
        .then((response: any) => {
          resolve(response)
        })
        .catch((err: any) => {
          logger.log('S3 error while uploading file', err)
          reject(err)
        })
    })
  }

  public downloadBlob(key: string, version = '1'): Promise<any> {
    const command = new GetObjectCommand({ Bucket: this.bucketName, Key: key })

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
          logger.log('S3 error while downloading file', err)
          if (err && err.statusCode === 404) {
            resolve(null)
          } else {
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
          logger.log('S3 error while uploading file', err)
          reject(err)
        })
    })
  }

  private bufferToStream(binary: Buffer) {
    return new Readable({
      read() {
        this.push(binary)
        this.push(null)
      },
    })
  }
}

export default S3
