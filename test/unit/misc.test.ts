import { contains, getStrippedTitleFromHtml, getStringsForLang } from '../../src/util/misc.js'
import domino from 'domino'
import { jest } from '@jest/globals'

describe('Misc utility', () => {
  test('contains', async () => {
    const arr = [1, 2, 3]
    const bool = contains(arr, 3)
    expect(bool).toBeTruthy()
  })

  describe('getStrippedTitleFromHtml', () => {
    const html = (title = 'Example') => {
      return `<!DOCTYPE html>
      <html>
          <head>
              <title>${title}</title>
          </head>
          <body>
              <p>This is an example of a simple HTML page with one paragraph.</p>
          </body>
      </html>`
    }

    afterEach(() => {
      jest.clearAllMocks()
    })

    test('empty html', async () => {
      const createDocumentSpy = jest.spyOn(domino, 'createDocument')
      const title = getStrippedTitleFromHtml('')
      expect(title).toBe('')
      expect(createDocumentSpy).toBeCalledTimes(1)
    })

    test('not valid html', async () => {
      const createDocumentSpy = jest.spyOn(domino, 'createDocument')
      const title = getStrippedTitleFromHtml('this is not valid HTML')
      expect(title).toBe('')
      expect(createDocumentSpy).toBeCalledTimes(1)
    })

    test('empty title', async () => {
      const createDocumentSpy = jest.spyOn(domino, 'createDocument')
      const title = getStrippedTitleFromHtml(html(''))
      expect(title).toBe('')
      expect(createDocumentSpy).toBeCalledTimes(1)
    })

    test('title as plain text', async () => {
      const createDocumentSpy = jest.spyOn(domino, 'createDocument')
      const title = getStrippedTitleFromHtml(html())
      expect(title).toBe('Example')
      expect(createDocumentSpy).not.toBeCalled()
    })

    test('title with different tags', async () => {
      const createDocumentSpy = jest.spyOn(domino, 'createDocument')
      const title1 = getStrippedTitleFromHtml(html('<i>Example</i>'))
      expect(title1).toBe('Example')

      const title2 = getStrippedTitleFromHtml(html('Example<script>alert("hello world!")</script>'))
      expect(title2).toBe('Examplealert("hello world!")')

      const title3 = getStrippedTitleFromHtml(html('Example<script\r>alert(test)</script\r>'))
      expect(title3).toBe('Examplealert(test)')

      expect(createDocumentSpy).toBeCalledTimes(1) // only last one can't be parsed with regex
    })
  })

  describe('getStringsForLang', () => {
    test('skips missing files without error', () => {
      const strings = getStringsForLang('XX', 'XX')
      expect(strings).toEqual({})
    })

    test('returns en strings if lang file is missing completely', () => {
      const strings = getStringsForLang('XX')
      expect(strings).toMatchObject({
        DISCLAIMER: 'This article is issued from ${creator}. The text is available under ${license} unless otherwise noted. Additional terms may apply for the media files.',
        LAST_EDITED_ON: 'Last edited on ${date}',
        LICENSE_UNKNOWN: 'an unknown license',
        DOWNLOAD_ERRORS_HEADING: 'Oops. Article not found.',
        DOWNLOAD_ERRORS_MESSAGE: "The requested article '${articleTitle}' is not available inside this ZIM, it was not possible to retrieve it from ${server}.",
        DOWNLOAD_ERRORS_LINE1_DELETED_ARTICLE:
          'This article was deleted after we compiled the list of articles to retrieve but before we fetched it to build the ZIM you are browsing.',
        DOWNLOAD_ERRORS_LINE1_WIKIMEDIA_DESKTOP_API_HTML_500_ERROR:
          'When the ZIM you are browsing was built, ${server} server failed to render this article HTML content and returned an HTTP 500 error.',
        DOWNLOAD_ERRORS_LINE1_WIKIMEDIA_DESKTOP_API_HTML_504_UPSTREAM_TIMEOUT:
          'When the ZIM you are browsing was built, ${server} server timed-out while rendering this article HTML content and returned an HTTP 504 error.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_UPSTREAM_TIMEOUT:
          'When the ZIM you are browsing was built, ${server} server ActionParse API timed-out while processing this article and returned an HTTP 504 error.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_HTML_503_ERROR:
          'When the ZIM you are browsing was built, ${server} server ActionParse API raised an HTTP 503 error while giving details about this article HTML.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_BAD_REVISION_ERROR:
          'When the ZIM you are browsing was built, ${server} server ActionParse API raised an unexpected bad revision ID error while giving details about this article HTML.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_UNREACHABLE_EXCEPTION_ERROR:
          'When the ZIM you are browsing was built, ${server} server ActionParse API raised an unreachable exception error while giving details about this article HTML.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_INVARIANT_EXCEPTION_ERROR:
          'When the ZIM you are browsing was built, ${server} server ActionParse API raised an invariant exception error while giving details about this article HTML.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_GENERIC_INTERNAL_API_ERROR:
          'When the ZIM you are browsing was built, ${server} server ActionParse API raised an internal API error while giving details about this article HTML.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_INTERNAL_API_TYPE_ERROR:
          'When the ZIM you are browsing was built, ${server} server ActionParse API raised an internal API type error while giving details about this article HTML.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_INVALID_ARGUMENT_EXCEPTION_ERROR:
          'When the ZIM you are browsing was built, ${server} server ActionParse API raised an argument exception error while giving details about this article HTML.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_TRUNCATED_RESPONSE:
          'When the ZIM you are browsing was built, ${server} server ActionParse API failed to give details about this article HTML because this article is way too big. Someone should probably split this article into multiple smaller articles on ${server} server.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_EMPTY_500_RESPONSE:
          'When the ZIM you are browsing was built, ${server} server ActionParse API failed to give details about this article HTML returning an empty response.',
        DOWNLOAD_ERRORS_LINE2: 'The missing article was replaced by the placeholder page you are currently seeing.',
        DOWNLOAD_ERRORS_LINE3: "Let's hope the issue will be solved on ${server} server and our next version of this ZIM will contain this article.",
      })
    })

    test('falls back to en strings if lang file is missing certain fields', () => {
      const strings = getStringsForLang('fi')
      expect(strings).toMatchObject({
        DISCLAIMER: 'This article is issued from ${creator}. The text is available under ${license} unless otherwise noted. Additional terms may apply for the media files.',
        LAST_EDITED_ON: 'Viimeksi muokattu ${date}',
        LICENSE_UNKNOWN: 'an unknown license',
        DOWNLOAD_ERRORS_HEADING: 'Oops. Article not found.',
        DOWNLOAD_ERRORS_MESSAGE: "The requested article '${articleTitle}' is not available inside this ZIM, it was not possible to retrieve it from ${server}.",
        DOWNLOAD_ERRORS_LINE1_DELETED_ARTICLE:
          'This article was deleted after we compiled the list of articles to retrieve but before we fetched it to build the ZIM you are browsing.',
        DOWNLOAD_ERRORS_LINE1_WIKIMEDIA_DESKTOP_API_HTML_500_ERROR:
          'When the ZIM you are browsing was built, ${server} server failed to render this article HTML content and returned an HTTP 500 error.',
        DOWNLOAD_ERRORS_LINE1_WIKIMEDIA_DESKTOP_API_HTML_504_UPSTREAM_TIMEOUT:
          'When the ZIM you are browsing was built, ${server} server timed-out while rendering this article HTML content and returned an HTTP 504 error.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_UPSTREAM_TIMEOUT:
          'When the ZIM you are browsing was built, ${server} server ActionParse API timed-out while processing this article and returned an HTTP 504 error.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_HTML_503_ERROR:
          'When the ZIM you are browsing was built, ${server} server ActionParse API raised an HTTP 503 error while giving details about this article HTML.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_BAD_REVISION_ERROR:
          'When the ZIM you are browsing was built, ${server} server ActionParse API raised an unexpected bad revision ID error while giving details about this article HTML.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_UNREACHABLE_EXCEPTION_ERROR:
          'When the ZIM you are browsing was built, ${server} server ActionParse API raised an unreachable exception error while giving details about this article HTML.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_INVARIANT_EXCEPTION_ERROR:
          'When the ZIM you are browsing was built, ${server} server ActionParse API raised an invariant exception error while giving details about this article HTML.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_GENERIC_INTERNAL_API_ERROR:
          'When the ZIM you are browsing was built, ${server} server ActionParse API raised an internal API error while giving details about this article HTML.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_INTERNAL_API_TYPE_ERROR:
          'When the ZIM you are browsing was built, ${server} server ActionParse API raised an internal API type error while giving details about this article HTML.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_INVALID_ARGUMENT_EXCEPTION_ERROR:
          'When the ZIM you are browsing was built, ${server} server ActionParse API raised an argument exception error while giving details about this article HTML.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_TRUNCATED_RESPONSE:
          'When the ZIM you are browsing was built, ${server} server ActionParse API failed to give details about this article HTML because this article is way too big. Someone should probably split this article into multiple smaller articles on ${server} server.',
        DOWNLOAD_ERRORS_LINE1_ACTION_PARSE_EMPTY_500_RESPONSE:
          'When the ZIM you are browsing was built, ${server} server ActionParse API failed to give details about this article HTML returning an empty response.',
        DOWNLOAD_ERRORS_LINE2: 'The missing article was replaced by the placeholder page you are currently seeing.',
        DOWNLOAD_ERRORS_LINE3: "Let's hope the issue will be solved on ${server} server and our next version of this ZIM will contain this article.",
      })
    })

    test('falls back to specified fallback language', () => {
      const strings = getStringsForLang('XX', 'de')
      console.log(JSON.stringify(strings))
      expect(strings).toMatchObject({
        DISCLAIMER:
          'Dieser Artikel wurde von ${creator} herausgegeben. Der Text ist verfügbar unter ${license}, sofern nicht anders angegeben. Möglicherweise können weitere Bestimmungen für Mediendateien gelten.',
        LAST_EDITED_ON: 'Zuletzt bearbeitet am ${date}',
        LICENSE_UNKNOWN: 'einer unbekannten Lizenz',
      })
    })
  })
})
