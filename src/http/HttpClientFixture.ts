import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { parseJsonBody } from './HttpClient.js'
import type { HttpClient, HttpRequest, HttpResponse } from './HttpClient.js'
import * as logger from '../Logger.js'

type FixtureEncoding = 'json' | 'utf8' | 'base64'

interface Fixture {
  request: {
    method: string
    url: string
  }
  response: {
    status: number
    statusText?: string
    headers: Record<string, string[]>
    body: string
    encoding: FixtureEncoding
  }
}

export interface HttpClientFixtureOptions {
  fixturesDir?: string
  recordMode?: boolean
  liveClient?: HttpClient
  missingFixtureCallback?: (url: string, fixturePath: string) => void
}

export class HttpClientFixture implements HttpClient {
  private readonly fixturesDir: string
  private readonly recordMode: boolean
  private readonly liveClient?: HttpClient
  private readonly missingFixtureCallback?: (url: string, fixturePath: string) => void

  constructor(options: HttpClientFixtureOptions = {}) {
    this.fixturesDir = options.fixturesDir ?? path.join(process.cwd(), 'test', 'fixtures')
    this.recordMode = options.recordMode ?? process.env.RECORD_FIXTURES === '1'
    this.liveClient = options.liveClient
    this.missingFixtureCallback = options.missingFixtureCallback
    if (this.recordMode && !this.liveClient) {
      throw new Error('HttpClientFixture needs a liveClient to record fixtures')
    }
  }

  async request<T = any>(config: HttpRequest): Promise<HttpResponse<T>> {
    const fixturePath = this.fixturePath(config)

    if (this.recordMode) {
      return this.record<T>(config, fixturePath)
    }
    if (fs.existsSync(fixturePath)) {
      return this.replay<T>(fixturePath)
    }
    if (process.env.UPDATE_FIXTURES === '1' && this.liveClient) {
      return this.record<T>(config, fixturePath)
    }

    this.missingFixtureCallback?.(config.url, fixturePath)
    throw new Error(`Missing fixture for ${config.method ?? 'GET'} ${config.url}. Expected at ${fixturePath}. Run with RECORD_FIXTURES=1 to record it.`)
  }

  async get<T = any>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'GET', url, headers })
  }

  async getJSON<T = any>(url: string, headers?: Record<string, string>): Promise<T> {
    return parseJsonBody<T>(await this.request({ method: 'GET', url, headers, responseType: 'json' }), url)
  }

  private async record<T>(config: HttpRequest, fixturePath: string): Promise<HttpResponse<T>> {
    const response = await this.liveClient.request<T>(config)
    this.saveFixture(config, response, fixturePath)
    return response
  }

  private replay<T>(fixturePath: string): HttpResponse<T> {
    const fixture: Fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
    return {
      status: fixture.response.status,
      statusText: fixture.response.statusText,
      headers: fixture.response.headers,
      data: decodeBody(fixture.response) as T,
    }
  }

  private saveFixture(config: HttpRequest, response: HttpResponse, fixturePath: string): void {
    const { body, encoding } = encodeBody(response.data)
    const fixture: Fixture = {
      request: { method: config.method ?? 'GET', url: config.url },
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body,
        encoding,
      },
    }
    fs.mkdirSync(path.dirname(fixturePath), { recursive: true })
    fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2))
    logger.info(`Saved fixture to ${fixturePath}`)
  }

  private fixturePath(config: HttpRequest): string {
    const url = new URL(config.url)
    const group = url.hostname.replace(/\./g, '_')
    const readable = `${url.pathname}${url.search}`
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 60)
    const digest = sha256(`${config.method ?? 'GET'} ${config.url} ${stringifyBody(config.body)}`).substring(0, 12)
    return path.join(this.fixturesDir, group, `${readable ? `${readable}_` : ''}${digest}.json`)
  }
}

function stringifyBody(body: unknown): string {
  if (body === undefined) {
    return ''
  }
  return typeof body === 'string' ? body : JSON.stringify(body)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function encodeBody(data: unknown): { body: string; encoding: FixtureEncoding } {
  if (Buffer.isBuffer(data)) {
    return { body: data.toString('base64'), encoding: 'base64' }
  }
  if (typeof data === 'string') {
    return { body: data, encoding: 'utf8' }
  }
  return { body: JSON.stringify(data), encoding: 'json' }
}

function decodeBody(response: Fixture['response']): unknown {
  switch (response.encoding) {
    case 'base64':
      return Buffer.from(response.body, 'base64')
    case 'json':
      return JSON.parse(response.body)
    default:
      return response.body
  }
}

export default HttpClientFixture
