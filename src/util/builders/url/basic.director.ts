import urlBuilder from './url.builder.js'

type DownloaderBaseUrlConditions = Array<{ condition: boolean; value: string }>

class BasicURLDirector {
  buildMediawikiBaseURL(domain: string) {
    return urlBuilder.setDomain(domain).build(true, '/')
  }

  buildDownloaderBaseUrl(conditions: DownloaderBaseUrlConditions): string | undefined {
    let baseUrl: string

    for (const { condition, value } of conditions) {
      if (condition) {
        baseUrl = value
        break
      }
    }

    return baseUrl
  }
}

const basicURLDirector = new BasicURLDirector()

export default basicURLDirector
