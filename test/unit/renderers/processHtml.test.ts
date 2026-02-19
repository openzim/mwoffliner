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

  describe('audio tags', () => {
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

  describe('iframe', () => {
    it('remove empty iframe', async () => {
      const { finalHTML } = await testProcessHtml(`<div id="foo"><iframe></iframe></div>`)
      expect(finalHTML).toContain('<div id="foo"></div>')
    })
    it('replace full non-youtube iframe with external placeholder', async () => {
      const { finalHTML } = await testProcessHtml(
        `<div id="foo">` +
          `<iframe id="inlineFrameExample" class="sample-frame" title="Inline Frame Example" width="300" height="200" style="border:0;" ` +
          `src="https://www.openstreetmap.org/export/embed.html"></iframe></div>`,
      )
      const finalDoc = domino.createDocument(finalHTML)
      expect(finalDoc.querySelector('#foo iframe') == null).toBe(true)
      const placeholder = finalDoc.querySelector('#foo .external-video-card') as DominoElement
      expect(placeholder).toBeDefined()
      expect(placeholder.getAttribute('id')).toBe('inlineFrameExample')
      expect(placeholder.getAttribute('width')).toBe('300')
      expect(placeholder.getAttribute('height')).toBe('200')
      expect(placeholder.getAttribute('style')).toContain('border')
      expect(placeholder.className).toContain('sample-frame')
      const link = finalDoc.querySelector('#foo .external-video-link')
      expect(link?.getAttribute('href')).toBe('https://www.openstreetmap.org/export/embed.html')
      expect(link?.getAttribute('onclick')).toContain('window.confirm')
      expect(link?.textContent).toContain('Open embedded content (external)')
    })
    it('replace iframe "with content" with external placeholder', async () => {
      const { finalHTML } = await testProcessHtml(
        `<div id="foo">` +
          `<iframe id="inlineFrameExample" title="Inline Frame Example" width="300" height="200" ` +
          `src="https://www.openstreetmap.org/export/embed.html"><span>bar</span></iframe></div>`,
      )
      const finalDoc = domino.createDocument(finalHTML)
      expect(finalDoc.querySelector('#foo iframe') == null).toBe(true)
      expect(finalDoc.querySelector('#foo .external-video-card')).not.toBeNull()
    })
    it('replace multiple iframes', async () => {
      const { finalHTML } = await testProcessHtml(
        `<div id="foo">` +
          `<iframe id="inlineFrameExample1" title="Inline Frame Example 1" width="300" height="200" ` +
          `src="https://www.openstreetmap.org/export/embed.html"></iframe></div>` +
          `<div id="bar">` +
          `<iframe id="inlineFrameExample2" title="Inline Frame Example 2" width="300" height="200" ` +
          `src="https://www.openstreetmap.org/export/embed.html"></iframe></div>`,
      )
      const finalDoc = domino.createDocument(finalHTML)
      expect(finalDoc.querySelectorAll('.external-video-card').length).toBe(2)
    })

     it('rewrites youtube.com embed iframe', async () => {
     const { finalHTML } = await testProcessHtml(`<div id="foo"><iframe src="https://www.youtube.com/embed/VIDEO_ID"></iframe></div>`)
      const finalDoc = domino.createDocument(finalHTML)
      expect(finalDoc.querySelector('#foo iframe') == null).toBe(true)
      expect(finalDoc.querySelector('#foo .external-video-card')).not.toBeNull()
      expect(finalDoc.querySelector('#foo .external-video-link')?.getAttribute('href')).toBe('https://www.youtube.com/watch?v=VIDEO_ID')
      expect(finalDoc.querySelector('#foo .external-video-link')?.getAttribute('onclick')).toContain('window.confirm')
      expect(finalDoc.querySelector('#foo .external-video-thumbnail img')?.getAttribute('src')).toContain('_assets_')
    })

    it('rewrites youtube-nocookie embed iframe', async () => {
      const { finalHTML } = await testProcessHtml(`<div id="foo"><iframe src="https://www.youtube-nocookie.com/embed/NOC_ID"></iframe></div>`)
      const finalDoc = domino.createDocument(finalHTML)
      expect(finalDoc.querySelector('#foo iframe') == null).toBe(true)
      expect(finalDoc.querySelector('#foo .external-video-link')?.getAttribute('href')).toBe('https://www.youtube.com/watch?v=NOC_ID')
    })

    it('rewrites youtu.be iframe', async () => {
      const { finalHTML } = await testProcessHtml(`<div id="foo"><iframe src="https://youtu.be/SHORT_ID"></iframe></div>`)
      const finalDoc = domino.createDocument(finalHTML)
      expect(finalDoc.querySelector('#foo iframe') == null).toBe(true)
      expect(finalDoc.querySelector('#foo .external-video-link')?.getAttribute('href')).toBe('https://www.youtube.com/watch?v=SHORT_ID')
    })

    it('rewrites youtube watch iframe', async () => {
      const { finalHTML } = await testProcessHtml(`<div id="foo"><iframe src="https://www.youtube.com/watch?v=WATCH_ID&t=20"></iframe></div>`)
      const finalDoc = domino.createDocument(finalHTML)
      expect(finalDoc.querySelector('#foo iframe') == null).toBe(true)
      expect(finalDoc.querySelector('#foo .external-video-link')?.getAttribute('href')).toBe('https://www.youtube.com/watch?v=WATCH_ID')
    })

    it('falls back to text link when youtube id extraction fails', async () => {
      const { finalHTML } = await testProcessHtml(`<div id="foo"><iframe src="https://www.youtube.com/watch?feature=share"></iframe></div>`)
      const finalDoc = domino.createDocument(finalHTML)
      const link = finalDoc.querySelector('#foo .external-video-link')
      expect(finalDoc.querySelector('#foo iframe') == null).toBe(true)
      expect(finalDoc.querySelector('#foo .external-video-fallback')).not.toBeNull()
      expect(finalDoc.querySelector('#foo .external-video-thumbnail')).toBeUndefined()
      expect(link?.getAttribute('href')).toBe('https://www.youtube.com/watch?feature=share')
      expect(link?.textContent).toContain('Watch on YouTube (external)')
    })
  })
})
