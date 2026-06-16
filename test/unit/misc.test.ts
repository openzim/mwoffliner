import { contains, getStrippedTitleFromHtml } from '../../src/util/misc.js'
import { createTranslator } from '../../src/i18n.js'
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
      expect(createDocumentSpy).toHaveBeenCalledTimes(1)
    })

    test('not valid html', async () => {
      const createDocumentSpy = jest.spyOn(domino, 'createDocument')
      const title = getStrippedTitleFromHtml('this is not valid HTML')
      expect(title).toBe('')
      expect(createDocumentSpy).toHaveBeenCalledTimes(1)
    })

    test('empty title', async () => {
      const createDocumentSpy = jest.spyOn(domino, 'createDocument')
      const title = getStrippedTitleFromHtml(html(''))
      expect(title).toBe('')
      expect(createDocumentSpy).toHaveBeenCalledTimes(1)
    })

    test('title as plain text', async () => {
      const createDocumentSpy = jest.spyOn(domino, 'createDocument')
      const title = getStrippedTitleFromHtml(html())
      expect(title).toBe('Example')
      expect(createDocumentSpy).not.toHaveBeenCalled()
    })

    test('title with different tags', async () => {
      const createDocumentSpy = jest.spyOn(domino, 'createDocument')
      const title1 = getStrippedTitleFromHtml(html('<i>Example</i>'))
      expect(title1).toBe('Example')

      const title2 = getStrippedTitleFromHtml(html('Example<script>alert("hello world!")</script>'))
      expect(title2).toBe('Examplealert("hello world!")')

      const title3 = getStrippedTitleFromHtml(html('Example<script\r>alert(test)</script\r>'))
      expect(title3).toBe('Examplealert(test)')

      expect(createDocumentSpy).toHaveBeenCalledTimes(1) // only last one can't be parsed with regex
    })
  })

  describe('createTranslator', () => {
    test('falls back to en when lang file is missing', async () => {
      const t = await createTranslator('XX')
      expect(t('DISCLAIMER')).toContain('{{creator}}')
      expect(t('LAST_EDITED_ON', { date: '2024-01-01' })).toBe('Last edited on 2024-01-01')
      expect(t('LICENSE_UNKNOWN')).toBe('an unknown license')
    })

    test('falls back to en for missing keys in partial translation', async () => {
      const t = await createTranslator('bn')
      expect(t('LAST_EDITED_ON', { date: '2024-01-01' })).toContain('2024-01-01')
      expect(t('LICENSE_UNKNOWN')).toBe('an unknown license')
    })

    test('uses specified fallback language', async () => {
      const t = await createTranslator('XX', 'de')
      expect(t('LAST_EDITED_ON', { date: '2024-01-01' })).toContain('2024-01-01')
      expect(t('LICENSE_UNKNOWN')).toBe('einer unbekannten Lizenz')
    })

    test('interpolates variables', async () => {
      const t = await createTranslator('en')
      expect(t('LAST_EDITED_ON', { date: '2024-06-15' })).toBe('Last edited on 2024-06-15')
      expect(t('DOWNLOAD_ERRORS_MESSAGE', { articleTitle: 'Foo', server: 'example.org' })).toContain('Foo')
      expect(t('DOWNLOAD_ERRORS_MESSAGE', { articleTitle: 'Foo', server: 'example.org' })).toContain('example.org')
    })

    test('handles plurals correctly for English', async () => {
      const t = await createTranslator('en')
      expect(t('categoryArticleCount', { count: 1, curPageCount: 1 })).toBe('This category contains only the following page.')
      expect(t('categoryArticleCount', { count: 5, curPageCount: 5 })).toBe('The following 5 pages are in this category, out of 5 total.')
      expect(t('categoryFileCount', { count: 1, curPageCount: 1 })).toBe('This category contains only the following file.')
      expect(t('categoryFileCount', { count: 3, curPageCount: 3 })).toBe('The following 3 files are in this category, out of 3 total.')
    })

    test('handles plurals correctly for German', async () => {
      const t = await createTranslator('de')
      expect(t('categoryArticleCount', { count: 1, curPageCount: 1 })).toBe('Diese Kategorie enthält nur die folgende Seite.')
      expect(t('categoryArticleCount', { count: 5, curPageCount: 5 })).toBe('Folgende 5 Seiten sind in dieser Kategorie, von 5 insgesamt.')
    })

    test('skips missing lang without error', async () => {
      await expect(createTranslator('XX', 'XX')).resolves.not.toThrow()
    })
  })
})
