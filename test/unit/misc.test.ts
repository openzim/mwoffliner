import { contains, getStrippedTitleFromHtml } from '../../src/util/misc.js'
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
      const title0 = getStrippedTitleFromHtml(html('&lt;i>Terminalia chebula&lt;/i>'))
      expect(title0).toBe('Terminalia chebula')

      const title1 = getStrippedTitleFromHtml(html('<i>Example</i>'))
      expect(title1).toBe('Example')

      const title2 = getStrippedTitleFromHtml(html('Example<script>alert("hello world!")</script>'))
      expect(title2).toBe('Examplealert("hello world!")')

      const title3 = getStrippedTitleFromHtml(html('Example<script\r>alert(test)</script\r>'))
      expect(title3).toBe('Examplealert(test)')

      expect(createDocumentSpy).toBeCalledTimes(1) // only last one can't be parsed with regex
    })
  })
})
