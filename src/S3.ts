import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import * as logger from './Logger.js'
import { Readable } from 'stream'
import { publicIpv4 } from 'public-ip'

class S3 {
  public url: any
  public params: any
  public s3Handler: any
  public bucketName: string
  public region: string

  constructor(s3Url: any, s3Params: any) {
    this.url = s3Url
    this.params = s3Params
    this.bucketName = s3Params.bucketName
  }

  public async initialise() {
    const s3UrlObj: any = new URL(this.url)
    const regionRegex: RegExp = /^https?:\/\/s3\.([^.]+)\.amazonaws\.com/;
    const match: RegExpMatchArray | null = this.url.match(regionRegex);
    if (match && match[1]) {
       this.region = match[1];
    }
    this.s3Handler = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.params.keyId,
        secretAccessKey: this.params.secretAccessKey,
      },
      endpoint: s3UrlObj.href,
      forcePathStyle: s3UrlObj.protocol === 'http:',
    })

    return await this.bucketExists(this.bucketName)
      .then(() => true)
      .catch(() => {
        throw new Error(`Unable to connect to S3, either S3 login credentials are wrong or bucket cannot be found
                            Bucket used: ${this.bucketName}
                            End point used: ${s3UrlObj.href}
                            Public IP used: ${publicIpv4()}`)
      })
  }

  public async bucketExists(bucket: string): Promise<any> {
    const command = new HeadBucketCommand({ Bucket: bucket })
    return new Promise((resolve, reject) => {
      this.s3Handler.send(command, (err) => {
        return err ? reject(err) : resolve(true)
      })
    })
  }

  public uploadBlob(key: string, data: any, eTag: string, contentType: string, version: string) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Metadata: { etag: eTag, contenttype: contentType, version },
      Body: this.bufferToStream(data),
    })

    try {
      this.s3Handler.send(command, (err) => {
        if (err) {
          logger.log(`Not able to upload ${key}: ${err}`)
        }
      })
    } catch (err) {
      logger.log('S3 error', err)
    }
  }

  public downloadBlob(key: string, version = '1'): Promise<any> {
    const command = new GetObjectCommand({ Bucket: this.bucketName, Key: key })

    return new Promise((resolve, reject) => {
      this.s3Handler
        .send(command)
        .then((response) => {
          if (response) {
            const { Metadata } = response
            if (Metadata?.version !== version) {
              Metadata.etag = undefined
            }
            resolve(response)
          } else reject()
        })
        .catch((err) => {
          if (err && err.statusCode === 404) {
            resolve(null)
          } else {
            reject(err)
          }
        })
    })
  }

  // Only for testing purpose
  public deleteBlob(key: any): Promise<any> {
    const command = new DeleteObjectCommand({ Bucket: this.bucketName, Key: key })

    return new Promise((resolve, reject) => {
      this.s3Handler
        .send(command)
        .then((val) => resolve(val))
        .catch((err) => reject(err))
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
