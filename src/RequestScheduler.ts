import * as backoff from 'backoff'
import type { BackoffStrategy } from 'backoff'
import axios, { AxiosError } from 'axios'

import * as logger from './Logger.js'

export interface BackoffOptions {
  strategy: BackoffStrategy
  failAfter: number
  retryIf: (error?: any) => boolean
  backoffHandler: (number: number, delay: number, error?: any) => void
}

export interface RequestSchedulerOptions {
  workers: number
  pageRequestInterval?: number
  requestTimeout: number
  backoffOptions?: BackoffOptions
}

const RETRYABLE_HTTP_STATUS_CODES = [429, 500, 502, 503, 504, 524]

const NON_RETRYABLE_MW_ERROR_CODES = [
  'missingtitle',
  'readapidenied',
  'permissiondenied',
  'internal_api_error_MediaWiki\\Revision\\BadRevisionException',
  'internal_api_error_Wikimedia\\Assert\\UnreachableException',
  'internal_api_error_Wikimedia\\Assert\\InvariantException',
  'internal_api_error_Wikimedia\\Parsoid\\Core\\ResourceLimitExceededException',
]

export function isMalformedJsonResponseError(err: unknown): boolean {
  if (err instanceof SyntaxError) {
    return true
  }

  if (!axios.isAxiosError(err) || err.code !== AxiosError.ERR_BAD_RESPONSE) {
    return false
  }

  return err.cause instanceof SyntaxError
}

export function defaultRetryIf(err: any): boolean {
  const requestedUrl = err.urlCalled || err.config?.url || 'unknown'
  if (isMalformedJsonResponseError(err)) {
    logger.info(`Retrying ${requestedUrl} due to malformed JSON response`)
    return true
  }

  if (err instanceof AxiosError && err.code && !['ERR_BAD_REQUEST', 'ERR_BAD_RESPONSE'].includes(err.code)) {
    logger.info(`Retrying ${requestedUrl} URL due to ${err.code} error`)
    return true
  }
  if (err.responseData?.error?.code === 'maxlag') {
    logger.info(`Mediawiki server is lagging ${err.responseData?.error?.lag}s; retrying in few seconds`)
    return true
  }
  const httpReturnCode = err.response?.status || err.httpReturnCode
  if (RETRYABLE_HTTP_STATUS_CODES.includes(httpReturnCode)) {
    logger.info(`Retrying ${requestedUrl} URL due to HTTP ${httpReturnCode} error`)
    return true
  }
  if (err.responseData?.error?.code && !NON_RETRYABLE_MW_ERROR_CODES.includes(err.responseData?.error?.code)) {
    logger.info(`Retrying ${requestedUrl} URL due to ${err.responseData?.error?.code} Mediawiki error`)
    return true
  }
  return false
}

export class RequestScheduler {
  private readonly _workers: number
  private readonly _pageRequestInterval: number
  private readonly _requestTimeout: number
  private readonly backoffOptions: BackoffOptions

  constructor({ workers, pageRequestInterval, requestTimeout, backoffOptions }: RequestSchedulerOptions) {
    this._workers = workers
    this._pageRequestInterval = pageRequestInterval
    this._requestTimeout = requestTimeout
    this.backoffOptions = {
      strategy: new backoff.ExponentialStrategy({ initialDelay: 1000, maxDelay: 60000 }),
      failAfter: 10,
      retryIf: defaultRetryIf,
      backoffHandler: (number: number, delay: number) => {
        logger.debug(`[backoff] #${number} after ${delay} ms`)
      },
      ...backoffOptions,
    }
  }

  get workers(): number {
    return this._workers
  }

  get pageRequestInterval(): number {
    return this._pageRequestInterval
  }

  get requestTimeout(): number {
    return this._requestTimeout
  }

  public schedule(handler: (...args: any[]) => void, url: string, kind: DownloadKind, displayWidth: number | undefined, callback: (...args: any[]) => void | Promise<void>): void {
    this.backoffOptions.strategy.reset()
    const call = backoff.call(handler, url, kind, displayWidth, callback)
    call.setStrategy(this.backoffOptions.strategy)
    call.retryIf(this.backoffOptions.retryIf)
    call.failAfter(this.backoffOptions.failAfter)
    call.on('backoff', this.backoffOptions.backoffHandler)
    call.start()
  }
}
