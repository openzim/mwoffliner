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
      expect(strings).toEqual({
        __direction: 'ltr',
        DISCLAIMER: 'This article is issued from ${creator}. The text is licensed under ${license}. Additional terms may apply for the media files.',
        LAST_EDITED_ON: 'Last edited on ${date}',
        LICENSE_NAME: 'Creative Commons - Attribution - Sharealike',
      })
    })

    test('falls back to en strings if lang file is missing certain fields', () => {
      const strings = getStringsForLang('fi')
      expect(strings).toEqual({
        __direction: 'ltr',
        DISCLAIMER: 'This article is issued from ${creator}. The text is licensed under ${license}. Additional terms may apply for the media files.',
        LAST_EDITED_ON: 'Viimeksi muokattu ${date}',
        LICENSE_NAME: 'Creative Commons - Nimeä - JaaSamoin',
      })
    })

    test('falls back to specified fallback language', () => {
      const strings = getStringsForLang('XX', 'de')
      console.log(JSON.stringify(strings))
      expect(strings).toEqual({
        DISCLAIMER:
          'Dieser Artikel wurde von ${creator} herausgegeben. Der Text ist als ${license} lizenziert. Möglicherweise können weitere Bestimmungen für Mediendateien gelten.',
        LAST_EDITED_ON: 'Zuletzt bearbeitet am ${date}',
        LICENSE_NAME: 'Creative Commons - Attribution - Sharealike',
      })
    })
  })
})
