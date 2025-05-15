import { renderDownloadError, findFirstMatchingRule } from '../../../src/error.manager.js'
import { Dump } from '../../../src/Dump.js'
import MediaWiki from '../../../src/MediaWiki.js'

describe('ErrorRenderer', () => {
  describe('findFirstMatchingRule', () => {
    it('should not handle 200 return code', async () => {
      const matchingRule = findFirstMatchingRule({
        urlCalled: 'https://www.acme.com/api/rest_v1/page/html/',
        httpReturnCode: 200,
        responseContentType: 'application/json',
        responseData: 'upstream request timeout',
      })
      expect(matchingRule).toBeNull()
    })
    it('should handle WikimediaDesktop 500 error', async () => {
      const matchingRule = findFirstMatchingRule({
        urlCalled: 'https://www.acme.com/api/rest_v1/page/html/Page1',
        httpReturnCode: 500,
        responseContentType: 'text/html',
        responseData: '---Our servers are currently under maintenance or experiencing a technical issue---',
      })
      expect(matchingRule.name).toBe('WikimediaDesktop API - HTML 500 error')
      expect(matchingRule.detailsMessageKey).toBe('WIKIMEDIA_DESKTOP_API_HTML_500_ERROR')
    })
    it('should not handle WikimediaMobile 500 error', async () => {
      const matchingRule = findFirstMatchingRule({
        urlCalled: 'https://www.acme.com/api/rest_v1/page/mobile-html/Page1',
        httpReturnCode: 500,
        responseContentType: 'text/html',
        responseData: '---Our servers are currently under maintenance or experiencing a technical issue---',
      })
      expect(matchingRule).toBeNull()
    })
    it('should not handle WikimediaDesktop 501 error', async () => {
      const matchingRule = findFirstMatchingRule({
        urlCalled: 'https://www.acme.com/api/rest_v1/page/html/Page1',
        httpReturnCode: 501,
        responseContentType: 'text/html',
        responseData: '---Our servers are currently under maintenance or experiencing a technical issue---',
      })
      expect(matchingRule).toBeNull()
    })
    it('should not handle WikimediaDesktop 500 bad content type', async () => {
      const matchingRule = findFirstMatchingRule({
        urlCalled: 'https://www.acme.com/api/rest_v1/page/html/Page1',
        httpReturnCode: 500,
        responseContentType: 'foo/html',
        responseData: '---Our servers are currently under maintenance or experiencing a technical issue---',
      })
      expect(matchingRule).toBeNull()
    })
    it('should not handle WikimediaDesktop 500 bad error message', async () => {
      const matchingRule = findFirstMatchingRule({
        urlCalled: 'https://www.acme.com/api/rest_v1/page/html/Page1',
        httpReturnCode: 500,
        responseContentType: 'text/html',
        responseData: '---Lorem ispum---',
      })
      expect(matchingRule).toBeNull()
    })
    it('should handle WikimediaDesktop 504 upstream timeout error', async () => {
      const matchingRule = findFirstMatchingRule({
        urlCalled: 'https://www.acme.com/api/rest_v1/page/html/Page1',
        httpReturnCode: 504,
        responseContentType: 'application/json',
        responseData: {
          httpReason: 'upstream request timeout',
        },
      })
      expect(matchingRule).not.toBeNull()
      expect(matchingRule.name).toBe('WikimediaDesktop API - JSON 504 Upstream Request Timeout')
      expect(matchingRule.detailsMessageKey).toBe('WIKIMEDIA_DESKTOP_API_HTML_504_UPSTREAM_TIMEOUT')
    })
    it('should handle ActionParse upstream timeout error', async () => {
      const matchingRule = findFirstMatchingRule({
        urlCalled: 'https://www.acme.com/api.php?action=parse&format=json&tile=page',
        httpReturnCode: 504,
        responseContentType: 'application/json',
        responseData: {
          error: {
            code: 'internal_api_error_Wikimedia\\RequestTimeout\\RequestTimeoutException',
          },
        },
      })
      expect(matchingRule).not.toBeNull()
      expect(matchingRule.name).toBe('ActionParse API - JSON Upstream Request Timeout')
      expect(matchingRule.detailsMessageKey).toBe('ACTION_PARSE_UPSTREAM_TIMEOUT')
    })
    it('should handle general 404', async () => {
      const matchingRule = findFirstMatchingRule({
        urlCalled: 'https://www.acme.com/api.php?action=parse&format=json&tile=page',
        httpReturnCode: 404,
        responseContentType: 'any/content_type',
        responseData: 'any response data',
      })
      expect(matchingRule).not.toBeNull()
      expect(matchingRule.name).toBe('404 return code')
      expect(matchingRule.detailsMessageKey).toBe('DELETED_ARTICLE')
    })
    it('should handle delete article message', async () => {
      const matchingRule = findFirstMatchingRule({
        urlCalled: 'https://www.acme.com/api.php?action=parse&format=json&tile=page',
        httpReturnCode: 200,
        responseContentType: 'any/content_type',
        responseData: '--- Article has been deleted. ---',
      })
      expect(matchingRule).not.toBeNull()
      expect(matchingRule.name).toBe('deleted article error')
      expect(matchingRule.detailsMessageKey).toBe('DELETED_ARTICLE')
    })
  })
  describe('renderDownloadError', () => {
    beforeAll(async () => {
      MediaWiki.base = 'https://fr.wikipedia.org'
    })

    it('should not handle 200 return code', async () => {
      const matchingRule = findFirstMatchingRule({
        urlCalled: 'https://www.acme.com/api/rest_v1/page/html/',
        httpReturnCode: 200,
        responseContentType: 'application/json',
        responseData: 'upstream request timeout',
      })
      expect(matchingRule).toBeNull()
    })
    it('should handle WikimediaDesktop 500 error', async () => {
      const matchingRule = findFirstMatchingRule({
        urlCalled: 'https://www.acme.com/api/rest_v1/page/html/Page1',
        httpReturnCode: 500,
        responseContentType: 'text/html',
        responseData: '---Our servers are currently under maintenance or experiencing a technical issue---',
      })
      expect(matchingRule).not.toBeNull()
      const rendererError = renderDownloadError(matchingRule, new Dump('', {} as any, {} as any), 'My_Article_Title', 'My Article Title')
      expect(rendererError).toBeTruthy()
      expect(rendererError).toContain('<title></title>')
      expect(rendererError).toContain('fr.wikipedia.org')
      expect(rendererError).toContain('returned an HTTP 500 error')
      expect(rendererError).not.toContain('${server}')
      expect(rendererError).not.toContain('${articleTitle}')
      expect(rendererError).toContain('My Article Title')
      expect(rendererError).toContain('hope the issue will be solved')
      expect(rendererError).toContain('"./article_not_found.svg"')
    })
    it('should handle 404 error', async () => {
      const matchingRule = findFirstMatchingRule({
        urlCalled: 'https://www.acme.com/api/rest_v1/page/html/Page1',
        httpReturnCode: 404,
        responseContentType: 'text/html',
        responseData: '---Our servers are currently under maintenance or experiencing a technical issue---',
      })
      expect(matchingRule).not.toBeNull()
      const rendererError = renderDownloadError(matchingRule, new Dump('', {} as any, {} as any), 'My/Article/Title', 'My Article Title')
      expect(rendererError).toBeTruthy()
      expect(rendererError).toContain('<title></title>')
      expect(rendererError).toContain('fr.wikipedia.org')
      expect(rendererError).toContain('article was deleted after we compiled')
      expect(rendererError).not.toContain('${server}')
      expect(rendererError).not.toContain('${articleTitle}')
      expect(rendererError).toContain('My Article Title')
      expect(rendererError).not.toContain('hope the issue will be solved')
      expect(rendererError).toContain('"../../article_not_found.svg"')
    })
  })
})
