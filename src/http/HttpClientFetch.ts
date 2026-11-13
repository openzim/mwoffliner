import axios, { AxiosRequestConfig, AxiosResponseHeaders } from 'axios'
import { parseJsonBody } from './HttpClient.js'
import type { HttpClient, HttpRequest, HttpResponse } from './HttpClient.js'

export class HttpClientFetch implements HttpClient {
  private readonly defaultConfig: AxiosRequestConfig

  constructor(defaultConfig?: AxiosRequestConfig) {
    this.defaultConfig = defaultConfig ?? {}
  }

  async request<T = any>(config: HttpRequest): Promise<HttpResponse<T>> {
    const response = await axios.request<T>({
      ...this.defaultConfig,
      method: config.method ?? 'GET',
      url: config.url,
      headers: { ...this.defaultConfig.headers, ...config.headers },
      data: config.body,
      responseType: config.responseType as AxiosRequestConfig['responseType'],
      validateStatus: () => true,
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

  async getJSON<T = any>(url: string, headers?: Record<string, string>): Promise<T> {
    return parseJsonBody<T>(await this.request({ method: 'GET', url, headers, responseType: 'json' }), url)
  }
}

function normalizeHeaders(headers: AxiosResponseHeaders | Record<string, unknown> | undefined): Record<string, string[]> {
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

export default HttpClientFetch
