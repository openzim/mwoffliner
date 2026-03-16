import { AxiosError } from 'axios'
import { jest } from '@jest/globals'

import { DownloaderClass } from '../../src/Downloader.js'
import MediaWiki from '../../src/MediaWiki.js'

const createDownloader = () => {
  MediaWiki.reset()
  MediaWiki.base = 'https://example.org'

  const downloader = new DownloaderClass()
  downloader.init = {
    uaString: 'mwoffliner-test-agent',
    speed: 1,
    reqTimeout: 1000,
    optimisationCacheUrl: '',
    webp: false,
  }

  return downloader
}

const stubImmediateBackoff = (downloader: DownloaderClass) => {
  ;(downloader as any).backoffCall = (handler: any, url: string, kind: any, cb: any) => {
    const retryIf = (downloader as any).backoffOptions.retryIf as (error?: any) => boolean
    let attempts = 0
    const run = () => {
      attempts += 1
      handler(url, kind, (err: any, val: any) => {
        if (err && attempts < 3 && retryIf(err)) {
          run()
          return
        }
        cb(err, val)
      })
    }
    run()
  }
}

describe('Downloader malformed JSON retry strategy', () => {
  test('requests raw text for JSON responses', () => {
    const downloader = createDownloader()
    expect((downloader as any).jsonRequestOptions.responseType).toBe('text')
    expect((downloader as any).jsonRequestOptions.transitional).toBeUndefined()
  })

  test('retries plain SyntaxError parse failures', () => {
    const downloader = createDownloader()
    const retryIf = (downloader as any).backoffOptions.retryIf as (error?: any) => boolean
    const err = new SyntaxError('Unexpected end of JSON input')

    expect(retryIf(err)).toBe(true)
  })

  test('retries malformed JSON parse failures when wrapped in cause', () => {
    const downloader = createDownloader()
    const retryIf = (downloader as any).backoffOptions.retryIf as (error?: any) => boolean
    const err = new AxiosError('Failed to parse API response', AxiosError.ERR_BAD_RESPONSE)
    ;(err as any).cause = new SyntaxError('Unexpected end of JSON input')

    expect(retryIf(err)).toBe(true)
  })

  test('does not treat generic ERR_BAD_RESPONSE as malformed JSON', () => {
    const downloader = createDownloader()
    const retryIf = (downloader as any).backoffOptions.retryIf as (error?: any) => boolean
    const err = new AxiosError('Request failed while handling response', AxiosError.ERR_BAD_RESPONSE)

    expect(retryIf(err)).toBe(false)
  })

  test('does not retry non-transient bad responses', () => {
    const downloader = createDownloader()
    const retryIf = (downloader as any).backoffOptions.retryIf as (error?: any) => boolean
    const err = new AxiosError('Request failed with status code 418', AxiosError.ERR_BAD_RESPONSE)
    ;(err as any).response = { status: 418 }

    expect(retryIf(err)).toBe(false)
  })

  test('getJSON parses successful raw string JSON responses', async () => {
    const downloader = createDownloader()
    ;(downloader as any).request = jest.fn().mockResolvedValue({
      data: '{"ok":true}',
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
    stubImmediateBackoff(downloader)

    await expect(downloader.getJSON('https://example.org/api')).resolves.toEqual({ ok: true })
  })

  test('getJSON retries once and succeeds after malformed JSON', async () => {
    const downloader = createDownloader()
    ;(downloader as any).request = jest
      .fn()
      .mockResolvedValueOnce({
        data: '{"ok":',
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
      .mockResolvedValueOnce({
        data: '{"ok":true}',
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    stubImmediateBackoff(downloader)

    await expect(downloader.getJSON('https://example.org/api')).resolves.toEqual({ ok: true })
    expect((downloader as any).request).toHaveBeenCalledTimes(2)
  })

  test('getJSON preserves raw HTML body for HTTP errors', async () => {
    const downloader = createDownloader()
    const err = new AxiosError('Request failed with status code 404', AxiosError.ERR_BAD_REQUEST)
    ;(err as any).response = {
      status: 404,
      data: '<html><body>Not found</body></html>',
      headers: { 'content-type': 'text/html' },
    }
    ;(err as any).config = { url: 'https://example.org/api' }
    ;(downloader as any).request = jest.fn().mockRejectedValue(err)
    stubImmediateBackoff(downloader)

    const retryIf = (downloader as any).backoffOptions.retryIf as (error?: any) => boolean
    expect(retryIf(err)).toBe(false)
    await expect(downloader.getJSON('https://example.org/api')).rejects.toMatchObject({
      response: {
        status: 404,
        data: '<html><body>Not found</body></html>',
        headers: { 'content-type': 'text/html' },
      },
    })
  })
})
