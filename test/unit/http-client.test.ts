import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import axios, { AxiosResponse } from 'axios'
import { jest } from '@jest/globals'
import { HttpClientFetch } from '../../src/http/HttpClientFetch.js'
import { HttpClientFixture } from '../../src/http/HttpClientFixture.js'
import type { HttpClient, HttpRequest, HttpResponse } from '../../src/http/HttpClient.js'

class StubClient implements HttpClient {
  readonly requests: HttpRequest[] = []
  private readonly responses: HttpResponse[]

  constructor(...responses: HttpResponse[]) {
    this.responses = responses
  }

  async request<T = any>(config: HttpRequest): Promise<HttpResponse<T>> {
    this.requests.push(config)
    const response = this.responses.shift()
    if (!response) {
      throw new Error(`No stub response left for ${config.method ?? 'GET'} ${config.url}`)
    }
    return response as HttpResponse<T>
  }

  async get<T = any>(url: string): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'GET', url })
  }

  async getJSON<T = any>(url: string): Promise<T> {
    return (await this.request<T>({ method: 'GET', url, responseType: 'json' })).data
  }
}

const API = 'https://en.wikipedia.org/w/api.php'

function fixtureFiles(dir: string): string[] {
  const groupDir = path.join(dir, 'en_wikipedia_org')
  return fs.existsSync(groupDir) ? fs.readdirSync(groupDir) : []
}

function fixtureContent(dir: string, fileName: string): string {
  return fs.readFileSync(path.join(dir, 'en_wikipedia_org', fileName), 'utf8')
}

function mockAxios(response: Partial<AxiosResponse>): any {
  return (jest.spyOn(axios, 'request') as any).mockResolvedValue({ status: 200, statusText: 'OK', headers: {}, data: undefined, ...response })
}

describe('HttpClientFixture', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mwoffliner-fixtures-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.UPDATE_FIXTURES
  })

  test('fails with the expected path when a fixture is missing', async () => {
    const client = new HttpClientFixture({ fixturesDir: tmpDir })

    await expect(client.get(`${API}?action=query`)).rejects.toThrow(/Missing fixture for GET .*action=query.*RECORD_FIXTURES=1/)
  })

  test('reports missing fixtures through the callback', async () => {
    const missing: string[] = []
    const client = new HttpClientFixture({ fixturesDir: tmpDir, missingFixtureCallback: (url) => missing.push(url) })

    await expect(client.get(`${API}?action=query`)).rejects.toThrow(/Missing fixture/)
    expect(missing).toEqual([`${API}?action=query`])
  })

  test('records a JSON response once and replays it afterwards', async () => {
    const live = new StubClient({ status: 200, statusText: 'OK', headers: { 'content-type': ['application/json'] }, data: { query: { pages: [] } } })
    const recorder = new HttpClientFixture({ fixturesDir: tmpDir, recordMode: true, liveClient: live })

    await expect(recorder.getJSON(`${API}?action=query`)).resolves.toEqual({ query: { pages: [] } })

    const [fileName] = fixtureFiles(tmpDir)
    expect(JSON.parse(fixtureContent(tmpDir, fileName)).response.encoding).toBe('json')

    const replay = new HttpClientFixture({ fixturesDir: tmpDir })
    await expect(replay.getJSON(`${API}?action=query`)).resolves.toEqual({ query: { pages: [] } })
  })

  test('keeps binary responses intact', async () => {
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    const live = new StubClient({ status: 200, headers: { 'content-type': ['image/png'] }, data: image })
    const recorder = new HttpClientFixture({ fixturesDir: tmpDir, recordMode: true, liveClient: live })

    await recorder.request({ url: `${API}?image=logo.png`, responseType: 'arraybuffer' })

    const [fileName] = fixtureFiles(tmpDir)
    expect(JSON.parse(fixtureContent(tmpDir, fileName)).response.encoding).toBe('base64')

    const response = await new HttpClientFixture({ fixturesDir: tmpDir }).request<Buffer>({ url: `${API}?image=logo.png` })
    expect(Buffer.isBuffer(response.data)).toBe(true)
    expect(response.data.equals(image)).toBe(true)
  })

  test('keeps text responses as text', async () => {
    const live = new StubClient({ status: 200, headers: { 'content-type': ['text/html'] }, data: '<html>hello</html>' })
    const recorder = new HttpClientFixture({ fixturesDir: tmpDir, recordMode: true, liveClient: live })

    await recorder.get(`${API}?page=Main_Page`)

    const response = await new HttpClientFixture({ fixturesDir: tmpDir }).get(`${API}?page=Main_Page`)
    expect(response.data).toBe('<html>hello</html>')
  })

  test('stores a fixture per query string instead of overwriting', async () => {
    const live = new StubClient({ status: 200, headers: {}, data: { title: 'One' } }, { status: 200, headers: {}, data: { title: 'Two' } })
    const recorder = new HttpClientFixture({ fixturesDir: tmpDir, recordMode: true, liveClient: live })

    await recorder.getJSON(`${API}?action=parse&page=One`)
    await recorder.getJSON(`${API}?action=parse&page=Two`)

    expect(fixtureFiles(tmpDir)).toHaveLength(2)

    const replay = new HttpClientFixture({ fixturesDir: tmpDir })
    await expect(replay.getJSON(`${API}?action=parse&page=One`)).resolves.toEqual({ title: 'One' })
    await expect(replay.getJSON(`${API}?action=parse&page=Two`)).resolves.toEqual({ title: 'Two' })
  })

  test('distinguishes POST requests by body without storing the body', async () => {
    const live = new StubClient({ status: 200, headers: {}, data: { title: 'One' } }, { status: 200, headers: {}, data: { title: 'Two' } })
    const recorder = new HttpClientFixture({ fixturesDir: tmpDir, recordMode: true, liveClient: live })

    await recorder.request({ method: 'POST', url: API, body: { action: 'parse', page: 'One', lgpassword: 'secret' } })
    await recorder.request({ method: 'POST', url: API, body: { action: 'parse', page: 'Two', lgpassword: 'secret' } })

    const files = fixtureFiles(tmpDir)
    expect(files).toHaveLength(2)
    for (const fileName of files) {
      expect(fixtureContent(tmpDir, fileName)).not.toContain('secret')
    }

    const replay = new HttpClientFixture({ fixturesDir: tmpDir })
    const first = await replay.request({ method: 'POST', url: API, body: { action: 'parse', page: 'One', lgpassword: 'secret' } })
    const second = await replay.request({ method: 'POST', url: API, body: { action: 'parse', page: 'Two', lgpassword: 'secret' } })
    expect(first.data).toEqual({ title: 'One' })
    expect(second.data).toEqual({ title: 'Two' })
  })

  test('distinguishes POST requests with string bodies', async () => {
    const live = new StubClient({ status: 200, headers: {}, data: { ok: true } })
    const recorder = new HttpClientFixture({ fixturesDir: tmpDir, recordMode: true, liveClient: live })

    await recorder.request({ method: 'POST', url: API, body: 'action=query&format=json' })

    await expect(new HttpClientFixture({ fixturesDir: tmpDir }).request({ method: 'POST', url: API, body: 'action=query&format=json' })).resolves.toMatchObject({
      data: { ok: true },
    })
  })

  test('replays non-2xx responses with their body', async () => {
    const live = new StubClient({ status: 404, statusText: 'Not Found', headers: { 'content-type': ['application/json'] }, data: { error: { code: 'missingtitle' } } })
    const recorder = new HttpClientFixture({ fixturesDir: tmpDir, recordMode: true, liveClient: live })

    await recorder.getJSON(`${API}?action=parse&page=Missing`)

    const replay = new HttpClientFixture({ fixturesDir: tmpDir })
    await expect(replay.getJSON(`${API}?action=parse&page=Missing`)).resolves.toEqual({ error: { code: 'missingtitle' } })
    await expect(replay.get(`${API}?action=parse&page=Missing`)).resolves.toMatchObject({ status: 404, statusText: 'Not Found' })
  })

  test('explains when getJSON receives a non-JSON response', async () => {
    const live = new StubClient({ status: 200, headers: { 'content-type': ['text/html'] }, data: '<html>Main Page</html>' })
    const recorder = new HttpClientFixture({ fixturesDir: tmpDir, recordMode: true, liveClient: live })

    await recorder.get(`${API}?page=Main_Page`)

    await expect(new HttpClientFixture({ fixturesDir: tmpDir }).getJSON(`${API}?page=Main_Page`)).rejects.toThrow(/Expected JSON from .*status 200/)
  })

  test('requires a live client to record', () => {
    expect(() => new HttpClientFixture({ fixturesDir: tmpDir, recordMode: true })).toThrow(/liveClient/)
  })

  test('records missing fixtures with UPDATE_FIXTURES', async () => {
    const live = new StubClient({ status: 200, headers: {}, data: { fresh: true } })
    const client = new HttpClientFixture({ fixturesDir: tmpDir, liveClient: live })
    process.env.UPDATE_FIXTURES = '1'

    await expect(client.getJSON(`${API}?action=query`)).resolves.toEqual({ fresh: true })
    expect(fixtureFiles(tmpDir)).toHaveLength(1)

    process.env.UPDATE_FIXTURES = '0'
    await expect(new HttpClientFixture({ fixturesDir: tmpDir }).getJSON(`${API}?action=query`)).resolves.toEqual({ fresh: true })
  })
})

describe('HttpClientFetch', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('returns non-2xx responses instead of rejecting', async () => {
    const spy = mockAxios({ status: 404, statusText: 'Not Found', data: { error: { code: 'missingtitle' } } })

    const response = await new HttpClientFetch().get(`${API}?action=query`)

    expect(response).toMatchObject({ status: 404, statusText: 'Not Found' })
    expect(response.data).toEqual({ error: { code: 'missingtitle' } })
    expect(spy.mock.calls[0][0].validateStatus(500)).toBe(true)
  })

  test('parses JSON bodies of non-2xx responses in getJSON', async () => {
    mockAxios({ status: 404, statusText: 'Not Found', data: '{"error":{"code":"missingtitle"}}' })

    await expect(new HttpClientFetch().getJSON(`${API}?action=query`)).resolves.toEqual({ error: { code: 'missingtitle' } })
  })

  test('passes the response type to axios', async () => {
    const bytes = Buffer.from([1, 2, 3])
    const spy = mockAxios({ data: bytes })

    const response = await new HttpClientFetch().request<Buffer>({ url: API, responseType: 'arraybuffer' })

    expect(spy.mock.calls[0][0].responseType).toBe('arraybuffer')
    expect(response.data).toBe(bytes)
  })

  test('merges default and request headers', async () => {
    const spy = mockAxios({ data: {} })

    await new HttpClientFetch({ headers: { 'user-agent': 'mwoffliner-test' } }).get(API, { accept: 'application/json' })

    expect(spy.mock.calls[0][0].headers).toEqual({ 'user-agent': 'mwoffliner-test', accept: 'application/json' })
  })

  test('exposes every header value as a list', async () => {
    mockAxios({ headers: { 'set-cookie': ['a=1', 'b=2'], 'content-type': 'text/html' }, data: '' })

    const response = await new HttpClientFetch().get(API)

    expect(response.headers).toEqual({ 'set-cookie': ['a=1', 'b=2'], 'content-type': ['text/html'] })
  })

  test('tolerates responses without headers', async () => {
    mockAxios({ headers: undefined, data: {} })

    const response = await new HttpClientFetch().get(API)

    expect(response.headers).toEqual({})
  })

  test('throws a clear error when getJSON receives non-JSON', async () => {
    mockAxios({ headers: { 'content-type': 'text/html' }, data: '<html></html>' })

    await expect(new HttpClientFetch().getJSON(API)).rejects.toThrow(/Expected JSON from https:\/\/en\.wikipedia\.org\/w\/api\.php/)
  })
})
