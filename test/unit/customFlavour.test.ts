import * as path from 'path'
import { fileURLToPath } from 'url'
import { jest } from '@jest/globals'
import Downloader from '../../src/Downloader.js'
import { isCustomFlavourUrl, loadCustomFlavour } from '../../src/util/customFlavour.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('customFlavour', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('isCustomFlavourUrl', () => {
    expect(isCustomFlavourUrl('https://example.com/flavour.js')).toBe(true)
    expect(isCustomFlavourUrl('http://example.com/flavour.js')).toBe(true)
    expect(isCustomFlavourUrl('wiktionary_fr')).toBe(false)
    expect(isCustomFlavourUrl('/some/path/flavour.js')).toBe(false)
    expect(isCustomFlavourUrl('ftp://example.com/flavour.js')).toBe(false)
  })

  test('loads a custom flavour from a local path', async () => {
    const customProcessor = await loadCustomFlavour(path.resolve(__dirname, '../../extensions/wiktionary_fr.js'))
    expect(typeof customProcessor.shouldKeepPage).toBe('function')
    expect(typeof customProcessor.preProcessPage).toBe('function')
  })

  test('downloads and loads a custom flavour from a URL', async () => {
    const request = jest.spyOn(Downloader, 'request').mockResolvedValue({
      data: 'export default class RemoteFlavour {\n  async shouldKeepPage(pageTitle) {\n    return pageTitle !== "London"\n  }\n}\n',
      status: 200,
      statusText: 'OK',
      headers: null,
      config: null,
    })
    const customProcessor = await loadCustomFlavour('https://example.com/flavours/remote.js')
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/flavours/remote.js', method: 'GET' }))
    expect(await customProcessor.shouldKeepPage('London')).toBe(false)
    expect(await customProcessor.shouldKeepPage('Paris')).toBe(true)
  })
})
