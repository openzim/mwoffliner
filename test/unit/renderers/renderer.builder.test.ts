import { jest } from '@jest/globals'
import { setupScrapeClasses } from '../../util.js'
import { RendererBuilder } from '../../../src/renderers/renderer.builder.js'
import { VisualEditorRenderer } from '../../../src/renderers/visual-editor.renderer.js'
import { RendererBuilderOptions } from '../../../src/renderers/abstract.renderer.js'
import { WikimediaDesktopRenderer } from '../../../src/renderers/wikimedia-desktop.renderer.js'

jest.setTimeout(10000)

describe('RendererBuilder', () => {
  let rendererBuilder: RendererBuilder
  beforeEach(() => {
    rendererBuilder = new RendererBuilder()
  })

  it('should create a WikimediaDesktopRenderer for desktop mode', async () => {
    const { MediaWiki } = await setupScrapeClasses() // en wikipedia

    const renderer = await rendererBuilder.createRenderer({
      MediaWiki,
      renderType: 'desktop',
    } as RendererBuilderOptions)
    expect(renderer).toBeInstanceOf(WikimediaDesktopRenderer)
  })

  it('should create a WikimediaDesktopRenderer for auto mode for en wikipedia', async () => {
    const { MediaWiki } = await setupScrapeClasses() // en wikipedia

    const renderer = await rendererBuilder.createRenderer({
      MediaWiki,
      renderType: 'auto',
    } as RendererBuilderOptions)
    expect(renderer).toBeInstanceOf(WikimediaDesktopRenderer)
  })

  it('should throw error for unknown render mode', async () => {
    const { MediaWiki } = await setupScrapeClasses() // en wikipedia

    expect(async () => {
      await rendererBuilder.createRenderer({
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

    const renderer = await rendererBuilder.createRenderer(rendererBuilderOptions as RendererBuilderOptions)

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

    const renderer = await rendererBuilder.createRenderer(rendererBuilderOptions as RendererBuilderOptions)

    expect(renderer).toBeInstanceOf(WikimediaDesktopRenderer)
  })

  it('should throw an error for unknown RendererAPI in specific mode', async () => {
    const { downloader, MediaWiki } = await setupScrapeClasses() // en wikipedia
    await MediaWiki.hasCoordinates(downloader)
    await MediaWiki.hasWikimediaDesktopApi()
    await MediaWiki.hasWikimediaMobileApi()
    await MediaWiki.hasVisualEditorApi()
    await downloader.setBaseUrls()

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
