import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import * as logger from './Logger.js'
import { publicIpv4 } from 'public-ip'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { Agent } from 'https'

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
  private reqTimeout: number
  private insecure: boolean

  constructor(s3Url: any, s3Params: any, reqTimeout: number, insecure: boolean) {
    this.url = s3Url
    this.params = s3Params
    this.bucketName = s3Params.bucketName
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
        accessKeyId: this.params.keyId,
        secretAccessKey: this.params.secretAccessKey,
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
      Key: key,
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
          // For 404 error handle AWS service-specific exception
          if (err && err.name === 'NoSuchKey') {
            logger.info(`The specified key '${key}' does not exist in the cache.`)
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
