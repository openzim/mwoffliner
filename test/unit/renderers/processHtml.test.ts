import { Dump } from '../../../src/Dump.js'
import { DownloadRes, ProcessHtmlOpts, Renderer } from '../../../src/renderers/abstract.renderer.js'
import MediaWiki from '../../../src/MediaWiki.js'
import domino from 'domino'

describe('processHtml', () => {
  class TestRender extends Renderer {
    download(): Promise<DownloadRes> {
      throw new Error('Method not implemented.')
    }
    render(): Promise<any> {
      throw new Error('Method not implemented.')
    }
  }

  const testRenderer = new TestRender()

  const audioSrc = '//upload.wikimedia.org/wikipedia/commons/9/9f/Local_Forecast_-_Elevator_%28ISRC_USUAN1300012%29.ogg'
  const expectedAudioPath = '_assets_/0c70a452f799bfe840676ee341124611/Local_Forecast_-_Elevator_(ISRC_USUAN1300012).'

  async function testProcessHtml(html: string) {
    MediaWiki.webUrl = new URL('https://en.wikipedia.org')
    MediaWiki.baseUrl = MediaWiki.webUrl
    MediaWiki.metaData = { mainPage: 'Main_Page' } as any
    const articleId = 'Test'
    const articleDetail = { title: articleId, timestamp: '2023-09-10T17:36:04Z' }
    const opts: ProcessHtmlOpts = {
      html,
      dump: new Dump('', {} as any, MediaWiki.metaData),
      articleId,
      articleDetail,
      moduleDependencies: {},
      callback: () => {
        return domino.createDocument('<html><head><title></title></head><body><div id="mw-content-text"></div></body></html>')
      },
    }
    return await testRenderer.processHtml(opts)
  }

  function checkAudioOnly(data) {
    const { finalHTML, videoDependencies } = data
    const finalDoc = domino.createDocument(finalHTML)
    const audioEls = finalDoc.getElementsByTagName('audio')
    expect(audioEls.length).toBe(1)
    const audioEl = audioEls[0]
    expect(audioEl.getAttribute('src')).toContain(`./${expectedAudioPath}`)
    expect(audioEl.getAttribute('resource')).toBeNull()
    expect(videoDependencies.length).toBe(1)
    const videoDependency = videoDependencies[0]
    expect(videoDependency.path).toContain(expectedAudioPath)
    expect(videoDependency.url).toContain(`https:${audioSrc.replace('.ogg', '.')}`)
  }

  it('rewrite audio with src attribute', async () => {
    checkAudioOnly(await testProcessHtml(`<audio src="${audioSrc}"></audio>`))
  })

  it('rewrite audio with resource attribute', async () => {
    checkAudioOnly(await testProcessHtml(`<audio resource="${audioSrc}"></audio>`))
  })

  it('rewrite audio with both src and resource attribute - order 1', async () => {
    checkAudioOnly(await testProcessHtml(`<audio src="${audioSrc}" resource="${audioSrc.replace('Elevator', 'Foo')}"></audio>`))
  })

  it('rewrite audio with both src and resource attribute - order 2', async () => {
    checkAudioOnly(await testProcessHtml(`<audio resource="${audioSrc.replace('Elevator', 'Foo')}" src="${audioSrc}"></audio>`))
  })

  function checkAudioWithSource(data) {
    const { finalHTML, videoDependencies } = data
    const finalDoc = domino.createDocument(finalHTML)
    const audioEls = finalDoc.getElementsByTagName('audio')
    expect(audioEls.length).toBe(1)
    const audioEl = audioEls[0]
    expect(audioEl.getAttribute('src')).toBeNull()
    expect(audioEl.getAttribute('resource')).toBeNull()
    const sourceEls = finalDoc.getElementsByTagName('source')
    expect(sourceEls.length).toBe(1)
    const sourceEl = sourceEls[0]
    expect(sourceEl.getAttribute('src')).toContain(`./${expectedAudioPath}`)
    expect(sourceEl.getAttribute('resource')).toBeNull()
    expect(videoDependencies.length).toBe(1)
    const videoDependency = videoDependencies[0]
    expect(videoDependency.path).toContain(expectedAudioPath)
    expect(videoDependency.url).toContain(`https:${audioSrc.replace('.ogg', '.')}`)
  }

  it('rewrite audio with src, resource attributes and one source', async () => {
    checkAudioWithSource(
      await testProcessHtml(`<audio src="${audioSrc.replace('Elevator', 'Foo')}" resource="${audioSrc.replace('Elevator', 'Bar')}"><source src="${audioSrc}"></audio>`),
    )
  })

  it('rewrite audio with src, resource attributes and two sources', async () => {
    checkAudioWithSource(
      await testProcessHtml(
        `<audio src="${audioSrc.replace('Elevator', 'Foo')}" resource="${audioSrc.replace('Elevator', 'Bar')}"><source src="${audioSrc}"><source src="${audioSrc.replace(
          'Elevator',
          'Foo',
        )}"></audio>`,
      ),
    )
  })

  it('rewrite audio with src, resource attributes and two sources, ogg first', async () => {
    checkAudioWithSource(
      await testProcessHtml(
        `<audio src="${audioSrc.replace('Elevator', 'Foo')}" resource="${audioSrc.replace(
          'Elevator',
          'Bar',
        )}"><source src="${audioSrc}" type="audio/ogg"><source src="${audioSrc.replace('Elevator', 'Foo')}"></audio>`,
      ),
    )
  })

  it('rewrite audio with src, resource attributes and two sources, ogg last with type', async () => {
    checkAudioWithSource(
      await testProcessHtml(
        `<audio src="${audioSrc.replace('Elevator', 'Foo')}" resource="${audioSrc.replace('Elevator', 'Bar')}"><source src="${audioSrc.replace(
          '.ogg',
          '.mp3',
        )}"><source src="${audioSrc.replace('.ogg', '.foo')}" type="audio/ogg"></audio>`,
      ),
    )
  })

  it('rewrite audio with src, resource attributes and two sources, ogg last without type', async () => {
    checkAudioWithSource(
      await testProcessHtml(
        `<audio src="${audioSrc.replace('Elevator', 'Foo')}" resource="${audioSrc.replace('Elevator', 'Bar')}"><source src="${audioSrc.replace(
          '.ogg',
          '.mp3',
        )}"><source src="${audioSrc}"><source src="${audioSrc.replace('Elevator', 'Foo')}"></audio>`,
      ),
    )
  })
})
