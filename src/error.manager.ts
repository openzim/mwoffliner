import { Dump } from 'src/Dump.js'
import { downloadErrorPlaceholderTemplate } from './Templates.js'
import { getRelativeFilePath, interpolateTranslationString } from './util/misc.js'
import MediaWiki from './MediaWiki.js'
import { DownloadErrorContext } from './Downloader.js'
import { DELETED_ARTICLE_ERROR } from './util/const.js'

interface HttpReturnCodeRange {
  min: number
  max: number
}

interface JsonContain {
  key: string
  valueContains: string[]
}

interface MatchingRule {
  name: string
  urlContains: string[] | null
  httpReturnCodes: HttpReturnCodeRange[] | null
  contentTypes: string[] | null
  rawResponseDataContains: string[] | null
  jsonResponseDataContains: JsonContain[] | null
  detailsMessageKey: string
  displayThirdLine: boolean
  isHardFailure: boolean
}

const matchingRules: MatchingRule[] = [
  {
    name: '404 return code',
    urlContains: null,
    httpReturnCodes: [{ min: 404, max: 404 }],
    contentTypes: null,
    rawResponseDataContains: null,
    jsonResponseDataContains: null,
    detailsMessageKey: 'DELETED_ARTICLE',
    displayThirdLine: false,
    isHardFailure: false,
  },
  {
    name: 'deleted article error',
    urlContains: null,
    httpReturnCodes: null,
    contentTypes: null,
    rawResponseDataContains: [DELETED_ARTICLE_ERROR],
    jsonResponseDataContains: null,
    detailsMessageKey: 'DELETED_ARTICLE',
    displayThirdLine: false,
    isHardFailure: false,
  },
  {
    name: 'missing title error',
    urlContains: null,
    httpReturnCodes: null,
    contentTypes: null,
    rawResponseDataContains: null,
    jsonResponseDataContains: [{ key: 'error.code', valueContains: ['missingtitle'] }],
    detailsMessageKey: 'DELETED_ARTICLE',
    displayThirdLine: false,
    isHardFailure: false,
  },
  {
    name: 'WikimediaDesktop API - HTML 500 error',
    urlContains: ['/api/rest_v1/page/html/'],
    httpReturnCodes: [{ min: 500, max: 500 }],
    contentTypes: ['text/html'],
    rawResponseDataContains: ['Our servers are currently under maintenance or experiencing a technical issue'],
    jsonResponseDataContains: null,
    detailsMessageKey: 'WIKIMEDIA_DESKTOP_API_HTML_500_ERROR',
    displayThirdLine: true,
    isHardFailure: true,
  },
  {
    name: 'WikimediaDesktop API - JSON 504 Upstream Request Timeout',
    urlContains: ['/api/rest_v1/page/html/'],
    httpReturnCodes: [{ min: 504, max: 504 }],
    contentTypes: ['application/json'],
    rawResponseDataContains: null,
    jsonResponseDataContains: [{ key: 'httpReason', valueContains: ['upstream request timeout'] }],
    detailsMessageKey: 'WIKIMEDIA_DESKTOP_API_HTML_504_UPSTREAM_TIMEOUT',
    displayThirdLine: true,
    isHardFailure: true,
  },
  {
    name: 'ActionParse API - JSON Upstream Request Timeout',
    urlContains: ['api.php?action=parse&format=json'],
    httpReturnCodes: [
      { min: 200, max: 200 },
      { min: 504, max: 504 },
    ],
    contentTypes: ['application/json'],
    rawResponseDataContains: null,
    jsonResponseDataContains: [{ key: 'error.code', valueContains: ['internal_api_error_Wikimedia\\RequestTimeout\\RequestTimeoutException'] }],
    detailsMessageKey: 'ACTION_PARSE_UPSTREAM_TIMEOUT',
    displayThirdLine: true,
    isHardFailure: true,
  },
  {
    name: 'ActionParse API - JSON 503 HTML error',
    urlContains: ['api.php?action=parse&format=json'],
    httpReturnCodes: [{ min: 503, max: 503 }],
    contentTypes: ['text/html'],
    rawResponseDataContains: ['Our servers are currently under maintenance or experiencing a technical problem'],
    jsonResponseDataContains: null,
    detailsMessageKey: 'ACTION_PARSE_HTML_503_ERROR',
    displayThirdLine: true,
    isHardFailure: true,
  },
  {
    name: 'ActionParse API - DB unexpected error',
    urlContains: ['api.php?action=parse&format=json'],
    httpReturnCodes: null,
    contentTypes: ['application/json'],
    rawResponseDataContains: null,
    jsonResponseDataContains: [{ key: 'error.code', valueContains: ['internal_api_error_DBUnexpectedError'] }],
    detailsMessageKey: 'ACTION_PARSE_DB_UNEXPECTED_ERROR',
    displayThirdLine: true,
    isHardFailure: true,
  },
  {
    name: 'ActionParse API - JSON BadRevisionException error',
    urlContains: ['api.php?action=parse&format=json'],
    httpReturnCodes: [{ min: 200, max: 200 }],
    contentTypes: ['application/json'],
    rawResponseDataContains: null,
    jsonResponseDataContains: [{ key: 'error.code', valueContains: ['internal_api_error_MediaWiki\\Revision\\BadRevisionException'] }],
    detailsMessageKey: 'ACTION_PARSE_BAD_REVISION_ERROR',
    displayThirdLine: true,
    isHardFailure: true,
  },
  {
    name: 'ActionParse API - JSON UnreachableException error',
    urlContains: ['api.php?action=parse&format=json'],
    httpReturnCodes: [{ min: 200, max: 200 }],
    contentTypes: ['application/json'],
    rawResponseDataContains: null,
    jsonResponseDataContains: [{ key: 'error.code', valueContains: ['internal_api_error_Wikimedia\\Assert\\UnreachableException'] }],
    detailsMessageKey: 'ACTION_PARSE_UNREACHABLE_EXCEPTION_ERROR',
    displayThirdLine: true,
    isHardFailure: true,
  },
  {
    name: 'ActionParse API - Truncated Response',
    urlContains: ['api.php?action=parse&format=json'],
    httpReturnCodes: null,
    contentTypes: null,
    rawResponseDataContains: null,
    jsonResponseDataContains: [{ key: 'warnings.result.*', valueContains: ['This result was truncated'] }],
    detailsMessageKey: 'ACTION_PARSE_TRUNCATED_RESPONSE',
    displayThirdLine: false,
    isHardFailure: true,
  },
]

function jsonMatch(jsonObject: any, keyPath: string, allowedValues: string[]) {
  const keys = keyPath.split('.')
  let current = jsonObject
  for (const key of keys) {
    if (current[key] === undefined) {
      return false
    }
    current = current[key]
  }
  return allowedValues.findIndex((allowedValue) => current.includes(allowedValue)) >= 0
}

export function findFirstMatchingRule(err: DownloadErrorContext): MatchingRule | null {
  for (const matchingRule of matchingRules) {
    if (
      (!matchingRule.urlContains || matchingRule.urlContains.findIndex((urlContain) => err.urlCalled.includes(urlContain)) >= 0) &&
      (!matchingRule.httpReturnCodes ||
        matchingRule.httpReturnCodes.findIndex((httpReturnCode) => err.httpReturnCode >= httpReturnCode.min && err.httpReturnCode <= httpReturnCode.max) >= 0) &&
      (!matchingRule.contentTypes ||
        matchingRule.contentTypes.findIndex((contentType) => (err.responseContentType || '').toLowerCase().includes(contentType.toLowerCase())) >= 0) &&
      (!matchingRule.rawResponseDataContains ||
        matchingRule.rawResponseDataContains.findIndex((rawResponseDataContain) => typeof err.responseData == 'string' && err.responseData.includes(rawResponseDataContain)) >=
          0) &&
      (!matchingRule.jsonResponseDataContains ||
        matchingRule.jsonResponseDataContains.findIndex(
          (jsonResponseDataContain) => typeof err.responseData == 'object' && jsonMatch(err.responseData, jsonResponseDataContain.key, jsonResponseDataContain.valueContains),
        ) >= 0)
    ) {
      return matchingRule
    }
  }
  return null
}

export function renderDownloadError(matchingRule: MatchingRule, dump: Dump, articleId: string, articleTitle: string): string | null {
  return downloadErrorPlaceholderTemplate({
    heading: dump.strings.DOWNLOAD_ERRORS_HEADING,
    relative_file_path: getRelativeFilePath(articleId, ''),
    message: interpolateTranslationString(dump.strings.DOWNLOAD_ERRORS_MESSAGE, {
      articleTitle: articleTitle,
      server: MediaWiki.baseUrl.hostname,
    }),
    advice_line1: interpolateTranslationString(dump.strings[`DOWNLOAD_ERRORS_LINE1_${matchingRule.detailsMessageKey}`], {
      server: MediaWiki.baseUrl.hostname,
    }),
    advice_line2: dump.strings.DOWNLOAD_ERRORS_LINE2,
    advice_line3: interpolateTranslationString(dump.strings.DOWNLOAD_ERRORS_LINE3, {
      server: MediaWiki.baseUrl.hostname,
    }),
    display_third_line: matchingRule.displayThirdLine,
    strings: dump.strings,
  })
}
