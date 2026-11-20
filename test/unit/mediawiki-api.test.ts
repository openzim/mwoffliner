import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { HttpClientFixture } from '../../src/http/HttpClientFixture.js'
import type { HttpClient, HttpRequest, HttpResponse } from '../../src/http/HttpClient.js'
import { MediaWikiApi } from '../../src/MediaWikiApi.js'

const API_URL = 'https://fixture.example.org/w/api.php'

const DEFAULT_QUERY_OPTS = {
  action: 'query',
  format: 'json',
  prop: 'info|redirects|revisions|categoryinfo|pageprops',
  rdlimit: 'max',
  rdprop: 'pageid|title|fragment',
  ppprop: 'nogallery',
  clprop: 'hidden',
  cllimit: 'max',
  formatversion: '2',
  maxlag: '5',
}

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

  async get<T = any>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'GET', url, headers })
  }

  async getJSON<T = any>(url: string, headers?: Record<string, string>): Promise<T> {
    return (await this.request<T>({ method: 'GET', url, headers, responseType: 'json' })).data
  }
}

function jsonResponse(data: any, status = 200): HttpResponse {
  return { status, statusText: 'OK', headers: { 'content-type': ['application/json'] }, data }
}

function createApi(httpClient: HttpClient, overrides: Record<string, any> = {}): MediaWikiApi {
  return new MediaWikiApi({
    httpClient,
    actionApiUrl: API_URL,
    queryOpts: { ...DEFAULT_QUERY_OPTS },
    apiCheckPageTitle: 'MediaWiki:Sidebar' as PageTitle,
    getCategories: false,
    versionMw: '1.43.0',
    ...overrides,
  })
}

async function withReplay<T>(
  responses: HttpResponse[],
  run: (api: MediaWikiApi) => Promise<T>,
  overrides: Record<string, any> = {},
): Promise<{ result: T; requests: HttpRequest[] }> {
  const fixturesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mwoffliner-mediawiki-api-'))
  try {
    const live = new StubClient(...responses)
    const recorder = new HttpClientFixture({ fixturesDir, recordMode: true, liveClient: live })
    await run(createApi(recorder, overrides))

    const replay = new HttpClientFixture({ fixturesDir })
    const result = await run(createApi(replay, overrides))
    return { result, requests: live.requests }
  } finally {
    fs.rmSync(fixturesDir, { recursive: true, force: true })
  }
}

describe('MediaWikiApi', () => {
  test('querySiteInfo replays a site-info fixture', async () => {
    const { result, requests } = await withReplay([jsonResponse({ batchcomplete: true, query: { general: { sitename: 'Fixture Wiki' } } })], (api) => api.querySiteInfo())

    expect(result.query.general.sitename).toBe('Fixture Wiki')
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toContain('meta=siteinfo%7Callmessages')
  })

  test('getPagesByTitle merges continuation responses', async () => {
    const responses = [
      jsonResponse({ batchcomplete: false, query: { pages: {} } }),
      jsonResponse({ batchcomplete: false, query: { pages: {} } }),
      jsonResponse({
        batchcomplete: false,
        query: { pages: { 10: { pageid: 10, title: 'First page', revisions: [{ revid: 1 }] } } },
        continue: { continue: 'page2||' },
      }),
      jsonResponse({
        batchcomplete: true,
        query: { pages: { 20: { pageid: 20, title: 'Second page', revisions: [{ revid: 2 }] } } },
      }),
    ]

    const { result, requests } = await withReplay(responses, (api) => api.getPagesByTitle(['First page', 'Second page'] as PageTitle[]))

    expect(result.map((page) => page.title)).toEqual(['First page', 'Second page'])
    expect(requests).toHaveLength(4)
    expect(requests[2].url).toContain('titles=First+page%7CSecond+page')
    expect(requests[3].url).toContain('continue=page2%7C%7C')
  })

  test('getPagesByTitle raises MediaWiki database errors', async () => {
    const responses = [
      jsonResponse({ batchcomplete: false, query: { pages: {} } }),
      jsonResponse({ batchcomplete: false, query: { pages: {} } }),
      jsonResponse({ batchcomplete: false, error: { code: 'internal_api_error_DBQueryError' }, query: { pages: {} } }),
    ]

    await expect(withReplay(responses, (api) => api.getPagesByTitle(['First page'] as PageTitle[]))).rejects.toThrow(/DBQueryError/)
  })

  test('getPagesByNamespace carries continuation tokens and returns gapContinue', async () => {
    const responses = [
      jsonResponse({ batchcomplete: false, query: { pages: {} } }),
      jsonResponse({ batchcomplete: false, query: { pages: {} } }),
      jsonResponse({
        batchcomplete: false,
        query: { pages: { 10: { pageid: 10, title: 'First page', revisions: [{ revid: 1 }] } } },
        'query-continue': { allpages: { gapcontinue: 'next' }, coordinates: { cocontinue: 'coord' } },
      }),
      jsonResponse({
        batchcomplete: true,
        query: { pages: { 20: { pageid: 20, title: 'Second page', revisions: [{ revid: 2 }] } } },
        'query-continue': { allpages: { gapcontinue: 'later' } },
      }),
    ]

    const { result, requests } = await withReplay(responses, (api) => api.getPagesByNamespace(0))

    expect(result.gapContinue).toBe('later')
    expect(result.pages.map((page) => page.title)).toEqual(['First page', 'Second page'])
    expect(requests).toHaveLength(4)
    expect(requests[2].url).toContain('generator=allpages')
    expect(requests[3].url).toContain('cocontinue=coord')
  })

  test('getLogEvents returns the log events', async () => {
    const logEvents = [{ params: { target_title: 'New title' } }]
    const { result, requests } = await withReplay([jsonResponse({ batchcomplete: true, query: { logevents: logEvents } })], (api) =>
      api.getLogEvents('move', 'Old title' as PageTitle),
    )

    expect(result).toEqual(logEvents)
    expect(requests[0].url).toContain('letype=move')
    expect(requests[0].url).toContain('letitle=Old+title')
  })

  test('login posts the login token and reports success', async () => {
    const responses = [jsonResponse({ batchcomplete: true, query: { tokens: { logintoken: 'token' } } }), jsonResponse({ batchcomplete: true, login: { result: 'Success' } })]
    const credentials = { username: 'fixture-user', password: 'fixture-password' }
    const { requests } = await withReplay(responses, (api) => api.login(), credentials)

    expect(requests).toHaveLength(2)
    expect(requests[0].url).toContain('meta=tokens')
    expect(requests[1].method).toBe('POST')
    expect(requests[1].body).toContain('lgname=fixture-user')
    expect(requests[1].body).toContain('lgtoken=token')
  }, 10000)
})
