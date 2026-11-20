import Downloader from '../Downloader.js'
import type { HttpClient, HttpRequest, HttpResponse } from './HttpClient.js'

function normalizeHeaders(headers: Record<string, any> | undefined): Record<string, string[]> {
  const normalized: Record<string, string[]> = {}
  if (!headers) {
    return normalized
  }
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) {
      continue
    }
    normalized[key] = Array.isArray(value) ? value.map(String) : [String(value)]
  }
  return normalized
}

export class HttpClientDownloader implements HttpClient {
  async request<T = any>(config: HttpRequest): Promise<HttpResponse<T>> {
    const response = await Downloader.request<T>({
      method: config.method ?? 'GET',
      url: config.url,
      headers: config.headers,
      data: config.body,
      responseType: config.responseType as any,
    })
    return {
      status: response.status,
      statusText: response.statusText,
      headers: normalizeHeaders(response.headers),
      data: response.data,
    }
  }

  async get<T = any>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'GET', url, headers })
  }

  async getJSON<T = any>(url: string): Promise<T> {
    return Downloader.getJSON<T>(url)
  }
}

export default HttpClientDownloader
