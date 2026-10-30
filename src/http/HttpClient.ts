export type HttpRequestResponseType = 'json' | 'text' | 'arraybuffer'

export interface HttpRequest {
  method?: string
  url: string
  headers?: Record<string, string>
  body?: any
  responseType?: HttpRequestResponseType
}

export interface HttpResponse<T = any> {
  status: number
  statusText?: string
  headers: Record<string, string[]>
  data: T
}

export interface HttpClient {
  request<T = any>(config: HttpRequest): Promise<HttpResponse<T>>
  get<T = any>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>>
  getJSON<T = any>(url: string, headers?: Record<string, string>): Promise<T>
}

export function parseJsonBody<T>(response: HttpResponse, url: string): T {
  if (typeof response.data !== 'string') {
    return response.data as T
  }
  try {
    return JSON.parse(response.data) as T
  } catch {
    const preview = response.data.substring(0, 120).replace(/\s+/g, ' ')
    throw new Error(`Expected JSON from ${url} but got status ${response.status} with body: ${preview}`)
  }
}
