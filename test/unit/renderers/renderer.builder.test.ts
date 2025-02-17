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

jest.setTimeout(10000)

describe('RendererBuilder', () => {
  let rendererBuilder: RendererBuilder
  let downloader: Downloader

  beforeEach(() => {
    rendererBuilder = new RendererBuilder()
    MediaWiki.base = 'https://en.wikipedia.org'
    downloader = new Downloader({ uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' })
  })

  it('should create a WikimediaDesktopRenderer for desktop mode', async () => {
    const { MediaWiki } = await setupScrapeClasses() // en wikipedia

    const renderer = await rendererBuilder.createRenderer(downloader, {
      MediaWiki,
      renderType: 'desktop',
    } as RendererBuilderOptions)
    expect(renderer).toBeInstanceOf(WikimediaDesktopRenderer)
  })

  it('should create a WikimediaDesktopRenderer for auto mode for en wikipedia', async () => {
    const { MediaWiki } = await setupScrapeClasses() // en wikipedia

    const renderer = await rendererBuilder.createRenderer(downloader, {
      MediaWiki,
      renderType: 'auto',
    } as RendererBuilderOptions)
    expect(renderer).toBeInstanceOf(WikimediaDesktopRenderer)
  })

  it('should throw error for unknown render mode', async () => {
    const { MediaWiki } = await setupScrapeClasses() // en wikipedia

    expect(async () => {
      await rendererBuilder.createRenderer(downloader, {
        MediaWiki,
        renderType: 'unknownMode' as any,
      } as RendererBuilderOptions)
    }).rejects.toThrow('Unknown render: unknownMode')
  })

  it('should return VisualEditorRenderer for specific mode with RendererAPI as VisualEditor', async () => {
    const { MediaWiki } = await setupScrapeClasses() // en wikipedia

    // Force MediaWiki to have capability for the VisualEditor for test purpose
    jest.spyOn(MediaWiki, 'hasVisualEditorApi').mockResolvedValue(true)

    const rendererBuilderOptions = {
      MediaWiki,
      renderType: 'specific',
      renderName: 'VisualEditor',
    }

    const renderer = await rendererBuilder.createRenderer(downloader, rendererBuilderOptions as RendererBuilderOptions)

    expect(renderer).toBeInstanceOf(VisualEditorRenderer)
  })

  it('should return WikimediaDesktopRenderer for specific mode with RendererAPI as WikimediaDesktop', async () => {
    const { MediaWiki } = await setupScrapeClasses() // en wikipedia

    // Force MediaWiki to have capability for the WikimediaDesktop for test purpose
    jest.spyOn(MediaWiki, 'hasWikimediaDesktopApi').mockResolvedValue(true)

    const rendererBuilderOptions = {
      MediaWiki,
      renderType: 'specific',
      renderName: 'WikimediaDesktop',
    }

    const renderer = await rendererBuilder.createRenderer(downloader, rendererBuilderOptions as RendererBuilderOptions)

    expect(renderer).toBeInstanceOf(WikimediaDesktopRenderer)
  })

  it('should return RestApiRenderer for specific mode with RendererAPI as RestApi', async () => {
    const { MediaWiki } = await setupScrapeClasses() // en wikipedia

    // Force MediaWiki to have capability for the RestApi for test purpose
    jest.spyOn(MediaWiki, 'hasRestApi').mockResolvedValue(true)

    const rendererBuilderOptions = {
      MediaWiki,
      renderType: 'specific',
      renderName: 'RestApi',
    }

    const renderer = await rendererBuilder.createRenderer(downloader, rendererBuilderOptions as RendererBuilderOptions)

    expect(renderer).toBeInstanceOf(RestApiRenderer)
  })

  it('should throw an error for unknown RendererAPI in specific mode', async () => {
    const { downloader, MediaWiki } = await setupScrapeClasses() // en wikipedia
    await MediaWiki.hasCoordinates(downloader)
    await MediaWiki.hasWikimediaDesktopApi(downloader)
    await MediaWiki.hasWikimediaMobileApi(downloader)
    await MediaWiki.hasRestApi(downloader)
    await MediaWiki.hasVisualEditorApi(downloader)

    const rendererBuilderOptions = {
      MediaWiki,
      renderType: 'specific',
      renderName: 'UnknownAPI', // Using an invalid RendererAPI for the test
    }

    expect(async () => rendererBuilder.createRenderer(downloader, rendererBuilderOptions as RendererBuilderOptions)).rejects.toThrow(
      `Unknown renderName for specific mode: ${rendererBuilderOptions.renderName}`,
    )
  })
})
