import { jest } from '@jest/globals'
import { setupScrapeClasses } from '../../util.js'
import { RendererBuilder } from '../../../src/util/renderers/renderer.builder.js'
import { VisualEditorRenderer } from '../../../src/util/renderers/visual-editor.renderer.js'
import { WikimediaDesktopRenderer } from '../../../src/util/renderers/wikimedia-desktop.renderer.js'
import { RendererBuilderOptions } from '../../../src/util/saveArticles.js'

jest.setTimeout(10000)

describe('RendererBuilder', () => {
  let rendererBuilder: RendererBuilder
  beforeEach(() => {
    rendererBuilder = new RendererBuilder()
  })

  it('should create a WikimediaDesktopRenderer for desktop mode', async () => {
    const { MediaWiki } = await setupScrapeClasses() // en wikipedia

    const renderer = rendererBuilder.createRenderer({
      MediaWiki,
      RendererMode: 'desktop',
    } as RendererBuilderOptions)
    expect(renderer).toBeInstanceOf(WikimediaDesktopRenderer)
  })

  it('should create a WikimediaDesktopRenderer for auto mode as this is default for en wikipedia', async () => {
    const { MediaWiki } = await setupScrapeClasses() // en wikipedia
    await MediaWiki.hasWikimediaDesktopRestApi()
    await MediaWiki.hasVisualEditorApi()

    const renderer = rendererBuilder.createRenderer({
      MediaWiki,
      RendererMode: 'auto',
    } as RendererBuilderOptions)
    expect(renderer).toBeInstanceOf(WikimediaDesktopRenderer)
  })

  it('should throw error for unknown render mode', async () => {
    const { MediaWiki } = await setupScrapeClasses() // en wikipedia

    expect(() => {
      rendererBuilder.createRenderer({
        MediaWiki,
        RendererMode: 'unknownMode' as any,
      } as RendererBuilderOptions)
    }).toThrow('Unknown render mode: unknownMode')
  })

  it('should return VisualEditorRenderer for specific mode with RendererAPI as VisualEditor', async () => {
    const { MediaWiki } = await setupScrapeClasses() // en wikipedia

    const rendererBuilderOptions = {
      MediaWiki,
      RendererMode: 'specific',
      RendererAPI: 'VisualEditor',
    }

    const renderer = rendererBuilder.createRenderer(rendererBuilderOptions as RendererBuilderOptions)

    expect(renderer).toBeInstanceOf(VisualEditorRenderer)
  })

  it('should return WikimediaDesktopRenderer for specific mode with RendererAPI as WikimediaDesktop', async () => {
    const { MediaWiki } = await setupScrapeClasses() // en wikipedia

    const rendererBuilderOptions = {
      MediaWiki,
      RendererMode: 'specific',
      RendererAPI: 'WikimediaDesktop',
    }

    const renderer = rendererBuilder.createRenderer(rendererBuilderOptions as RendererBuilderOptions)

    expect(renderer).toBeInstanceOf(WikimediaDesktopRenderer)
  })

  it('should throw an error for unknown RendererAPI in specific mode', async () => {
    const { downloader, MediaWiki } = await setupScrapeClasses() // en wikipedia
    await MediaWiki.hasWikimediaDesktopRestApi()
    await MediaWiki.hasVisualEditorApi()
    await downloader.setBaseUrls()

    const rendererBuilderOptions = {
      MediaWiki,
      RendererMode: 'specific',
      RendererAPI: 'UnknownAPI', // Using an invalid RendererAPI for the test
    }

    expect(() => rendererBuilder.createRenderer(rendererBuilderOptions as RendererBuilderOptions)).toThrow(
      `Unknown RendererAPI for specific mode: ${rendererBuilderOptions.RendererAPI}`,
    )
  })
})