import { contains, getStrippedTitleFromHtml, getStringsForLang, encodeArticleIdForZimHtmlUrl,getMediaBase } from '../../src/util/misc.js'
import domino from 'domino'
import { jest } from '@jest/globals'
import crypto from 'crypto'

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
      const strings = getStringsForLang('bn')
      expect(strings).toMatchObject({
        DISCLAIMER: 'This article is issued from ${creator}. The text is available under ${license} unless otherwise noted. Additional terms may apply for the media files.',
        LAST_EDITED_ON: '${date} তারিখে সর্বশেষ সম্পাদিত',
        LICENSE_UNKNOWN: 'an unknown license',
        DOWNLOAD_ERRORS_HEADING: 'Oops. Article not found.',
        DOWNLOAD_ERRORS_MESSAGE: "The requested article '${articleTitle}' is not available inside this ZIM, it was not possible to retrieve it from ${server}.",
        DOWNLOAD_ERRORS_LINE1_DELETED_ARTICLE:
          'This article was deleted after we compiled the list of articles to retrieve but before we fetched it to build the ZIM you are browsing.',
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
          'Dieser Artikel wurde von ${creator} herausgegeben. Der Text ist unter ${license} verfügbar, sofern nicht anders angegeben. Für die Mediendateien können zusätzliche Bedingungen gelten.',
        LAST_EDITED_ON: 'Zuletzt bearbeitet am ${date}',
        LICENSE_UNKNOWN: 'einer unbekannten Lizenz',
      })
    })
  })

describe('encodeArticleIdForZimHtmlUrl', ()=>{

// TEST THAT IT ENCODE THE ARTICLE ID CORRECTLY  
  test('encodes simple article id', () => {      //a simple article ID with a space  
  const result = encodeArticleIdForZimHtmlUrl('Hello World')
  expect(result).toBe('Hello%20World')     // ensuring that the generated URLs are valid and can be accessed correctly in the ZIM file.
})

// TEST THAT IT PRESERVES SLASHES IN ARTICLE ID
test('does not encode slashes in nested paths', () => {  // contain slashes to represent nested paths
  const result = encodeArticleIdForZimHtmlUrl('Category/SubPage')
  expect(result).toBe('Category/SubPage')  // slashes should not be encoded to ensure the correct structure of the URLs in the ZIM file. 
})

// TEST THAT IT ADDS ./ IN FRONT OF ARTICLE ID STARTING WITH SLASH
test('adds ./ when articleId starts with slash', () => {
  const result = encodeArticleIdForZimHtmlUrl('/Main Page')
    expect(result).toBe('.//Main%20Page')
})

// TEST THAT IT ENCODE SPECIAL CHARACTERS BUT PRESERVES SLASHES
test('encodes special characters but preserves slashes', () => {
  const result = encodeArticleIdForZimHtmlUrl('Page/With Space & Symbols')
  expect(result).toBe('Page/With%20Space%20%26%20Symbols')
})

})


describe('getMediaBase',()=>{

//TEST THAT IT HASHES THE FILENAME CORRECTLY WHEN NO REGEX MATCHES
test('uses md5 hash fallback for unknown URL', () => {
  const url = 'data:image/png;base64,AAAA'  // We must provide a URL that cannot match any of the regex patterns
  const result = getMediaBase(url, true)

  const expectedHash = crypto 
    .createHash('md5')
    .update(decodeURI(url))
    .digest('hex')

  expect(result).toContain(expectedHash)
})

// TEST THAT IT ENCODE THE FILENAME CORRECTLY WHEN ESCAPE IS TRUE
test('escapes filename when escape=true', () => {
  const url = 'https://example_rishabh.com/image with space.png'     // URL contains a space, which should be encoded as %20 when escape is true
  const result = getMediaBase(url, true)  
  expect(result).toMatch(/%20/)
})
// SAME URL SAME RESULT(DETERMINISTIC)
test('same URL produces same result', () => {
  const url = 'https://example.com/test.png'      //A fixed URL to test that the function produces the same result for the same input, 
                                                  // which is important for caching and consistency
  const result1 = getMediaBase(url, false)
  const result2 = getMediaBase(url, false)
  expect(result1).toBe(result2) //
})
})})
