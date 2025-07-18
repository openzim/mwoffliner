import { jest } from '@jest/globals'
import { setupScrapeClasses } from '../../util.js'
import { RendererBuilder } from '../../../src/renderers/renderer.builder.js'
import { RendererBuilderOptions } from '../../../src/renderers/abstract.renderer.js'
import { WikimediaDesktopRenderer } from '../../../src/renderers/wikimedia-desktop.renderer.js'
import { VisualEditorRenderer } from '../../../src/renderers/visual-editor.renderer.js'
import { RestApiRenderer } from '../../../src/renderers/rest-api.renderer.js'
import MediaWiki from '../../../src/MediaWiki.js'
import Downloader from '../../../src/Downloader.js'
import { config } from '../../../src/config.js'
import { ActionParseRenderer } from '../../../src/renderers/action-parse.renderer.js'

jest.setTimeout(10000)

describe('RendererBuilder', () => {
  let rendererBuilder: RendererBuilder

  beforeEach(() => {
    rendererBuilder = new RendererBuilder()
    MediaWiki.base = 'https://en.wikipedia.org'
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }
  })

  it('should create a ActionParseRenderer for desktop mode', async () => {
    await setupScrapeClasses() // en wikipedia

    const renderer = await rendererBuilder.createRenderer({
      MediaWiki,
      renderType: 'desktop',
    } as RendererBuilderOptions)
    expect(renderer).toBeInstanceOf(ActionParseRenderer)
  })

  it('should create a ActionParseRenderer for mobile mode', async () => {
    await setupScrapeClasses() // en wikipedia

    const renderer = await rendererBuilder.createRenderer({
      MediaWiki,
      renderType: 'mobile',
    } as RendererBuilderOptions)
    expect(renderer).toBeInstanceOf(ActionParseRenderer)
  })

  it('should create a ActionParseRenderer for auto mode', async () => {
    await setupScrapeClasses() // en wikipedia

    const renderer = await rendererBuilder.createRenderer({
      MediaWiki,
      renderType: 'auto',
    } as RendererBuilderOptions)
    expect(renderer).toBeInstanceOf(ActionParseRenderer)
  })

  it('should throw error for unknown render mode', async () => {
    await setupScrapeClasses() // en wikipedia

    expect(async () => {
      await rendererBuilder.createRenderer({
        MediaWiki,
        renderType: 'unknownMode' as any,
      } as RendererBuilderOptions)
    }).rejects.toThrow('Unknown render: unknownMode')
  })

  it('should return VisualEditorRenderer for specific mode with RendererAPI as VisualEditor', async () => {
    await setupScrapeClasses() // en wikipedia

    // Force MediaWiki to have capability for the VisualEditor for test purpose
    jest.spyOn(MediaWiki, 'hasVisualEditorApi').mockResolvedValue(true)

    const rendererBuilderOptions = {
      MediaWiki,
      renderType: 'specific',
      renderName: 'VisualEditor',
    }

    const renderer = await rendererBuilder.createRenderer(rendererBuilderOptions as RendererBuilderOptions)

    expect(renderer).toBeInstanceOf(VisualEditorRenderer)
  })

  it('should return WikimediaDesktopRenderer for specific mode with RendererAPI as WikimediaDesktop', async () => {
    await setupScrapeClasses() // en wikipedia

    // Force MediaWiki to have capability for the WikimediaDesktop for test purpose
    jest.spyOn(MediaWiki, 'hasWikimediaDesktopApi').mockResolvedValue(true)

    const rendererBuilderOptions = {
      MediaWiki,
      renderType: 'specific',
      renderName: 'WikimediaDesktop',
    }

    const renderer = await rendererBuilder.createRenderer(rendererBuilderOptions as RendererBuilderOptions)

    expect(renderer).toBeInstanceOf(WikimediaDesktopRenderer)
  })

  it('should return RestApiRenderer for specific mode with RendererAPI as RestApi', async () => {
    await setupScrapeClasses() // en wikipedia

    // Force MediaWiki to have capability for the RestApi for test purpose
    jest.spyOn(MediaWiki, 'hasRestApi').mockResolvedValue(true)

    const rendererBuilderOptions = {
      MediaWiki,
      renderType: 'specific',
      renderName: 'RestApi',
    }

    const renderer = await rendererBuilder.createRenderer(rendererBuilderOptions as RendererBuilderOptions)

    expect(renderer).toBeInstanceOf(RestApiRenderer)
  })

  it('should throw an error for unknown RendererAPI in specific mode', async () => {
    await setupScrapeClasses() // en wikipedia
    await MediaWiki.hasCoordinates()
    await MediaWiki.hasWikimediaDesktopApi()
    await MediaWiki.hasWikimediaMobileApi()
    await MediaWiki.hasRestApi()
    await MediaWiki.hasVisualEditorApi()

    const rendererBuilderOptions = {
      MediaWiki,
      renderType: 'specific',
      renderName: 'UnknownAPI', // Using an invalid RendererAPI for the test
    }

    expect(async () => rendererBuilder.createRenderer(rendererBuilderOptions as RendererBuilderOptions)).rejects.toThrow(
      `Unknown renderName for specific mode: ${rendererBuilderOptions.renderName}`,
    )
  })
})
