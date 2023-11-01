import domino from 'domino'
import { Dump } from '../../../src/Dump.js'
import { Renderer } from '../../../src/renderers/abstract.renderer.js'
import { convertWikicodeToHtml, setupScrapeClasses, testHtmlRewritingE2e } from '../../util.js'
import { startRedis, stopRedis } from '../bootstrap.js'

describe('MediaTreatment', () => {
  class TestableRenderer extends Renderer {
    public render(): any {
      return null
    }
    public async testTreatVideo(dump: Dump, srcCache: KVS<boolean>, articleId: string, videoEl: DominoElement, webp: boolean) {
      return this.treatVideo(dump, srcCache, articleId, videoEl, webp)
    }
    public async testTreatSubtitle(trackEle: DominoElement, articleId: string) {
      return this.treatSubtitle(trackEle, articleId)
    }
    public async testTreatMedias(parsoidDoc: DominoElement, dump: Dump, articleId: string, webp: boolean) {
      return this.treatMedias(parsoidDoc, dump, articleId, webp)
    }
  }

  const testableRenderer = new TestableRenderer()

  const html = `
    <img src=\"//upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Dendritic_cell_revealed.jpg/250px-Dendritic_cell_revealed.jpg\" data-file-width=\"3000\" data-file-height=\"2250\" data-file-type=\"bitmap\" height=\"188\" width=\"250\" srcset=\"//upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Dendritic_cell_revealed.jpg/500px-Dendritic_cell_revealed.jpg 2x, //upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Dendritic_cell_revealed.jpg/375px-Dendritic_cell_revealed.jpg 1.5x\">
    <video poster=\"//upload.wikimedia.org/wikipedia/commons/thumb/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/120px--S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.jpg\" preload=\"none\" height=\"115\" width=\"120\" resource=\"./File:S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv\" type=\"video/ogg; codecs=&quot;theora&quot;\" data-file-width=\"264\" data-file-height=\"254\" data-title=\"Original Ogg file, 264 × 254 (501 kbps)\" data-shorttitle=\"Ogg source\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.120p.vp9.webm\" type=\"video/webm; codecs=&quot;vp9, opus&quot;\" data-width=\"124\" data-height=\"120\" data-title=\"Lowest bandwidth VP9 (120P)\" data-shorttitle=\"VP9 120P\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.160p.webm\" type=\"video/webm; codecs=&quot;vp8, vorbis&quot;\" data-width=\"166\" data-height=\"160\" data-title=\"Low bandwidth WebM (160P)\" data-shorttitle=\"WebM 160P\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.180p.vp9.webm\" type=\"video/webm; codecs=&quot;vp9, opus&quot;\" data-width=\"188\" data-height=\"180\" data-title=\"Low bandwidth VP9 (180P)\" data-shorttitle=\"VP9 180P\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.240p.vp9.webm\" type=\"video/webm; codecs=&quot;vp9, opus&quot;\" data-width=\"250\" data-height=\"240\" data-title=\"Small VP9 (240P)\" data-shorttitle=\"VP9 240P\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.240p.webm\" type=\"video/webm; codecs=&quot;vp8, vorbis&quot;\" data-width=\"250\" data-height=\"240\" data-title=\"Small WebM (240P)\" data-shorttitle=\"WebM 240P\"></video>
`

  describe('treatSubtitle', () => {
    test('treat one subtitle', async () => {
      const { dump } = await setupScrapeClasses({ format: '', mwWikiPath: '/' })

      // Wikicode is taken from article "Mechanical energy" which has a video with subtitle
      const wikicode =
        '[[File:Physicsworks.ogv|thumb|200px|alt="Lecture demonstrating conservation of mechanical energy"|MIT professor [[Walter Lewin]] demonstrating conservation of mechanical energy]]'
      const htmlStr = await convertWikicodeToHtml(wikicode, dump.mwMetaData.baseUrl)

      const htmlDoc = domino.createDocument(htmlStr.data)
      const contentRes = await testableRenderer.testTreatSubtitle(htmlDoc.querySelector('track'), 'Mechanical energy')
      // Converted wikicode to HTML for one subtitle
      testHtmlRewritingE2e(wikicode, htmlStr.data)
      // Video subtitle rewriting matches
      expect(contentRes).toEqual('https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3APhysicsworks.ogv&lang=en&trackformat=vtt&origin=*')
    })
  })

  describe('treatVideo', () => {
    test('treat multiple subtitles in one video', async () => {
      const { dump } = await setupScrapeClasses({ format: '', mwWikiPath: '/' })

      // Wikicode is taken from article "User:Charliechlorine/sandbox" which has multiple(4) subtitles in this video
      const wikicode = '[[File:Videoonwikipedia.ogv|thumb|thumbtime=0:58|left|320px|Video about kola nuts ]]'
      const htmlStr = await convertWikicodeToHtml(wikicode, dump.mwMetaData.baseUrl)

      const htmlDoc = domino.createDocument(htmlStr.data)
      const contentRes = await testableRenderer.testTreatVideo(dump, {}, 'User:Charliechlorine/sandbox', htmlDoc.querySelector('video'), false)
      // Converted wikicode to HTML for multiple subtitle
      testHtmlRewritingE2e(wikicode, htmlStr.data)
      // Video multiple subtitles rewriting matches
      expect(contentRes.subtitles).toEqual([
        'https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3AVideoonwikipedia.ogv&lang=en&trackformat=vtt&origin=*',
        'https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3AVideoonwikipedia.ogv&lang=eu&trackformat=vtt&origin=*',
        'https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3AVideoonwikipedia.ogv&lang=fa&trackformat=vtt&origin=*',
        'https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3AVideoonwikipedia.ogv&lang=fr&trackformat=vtt&origin=*',
        'https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3AVideoonwikipedia.ogv&lang=sv&trackformat=vtt&origin=*',
      ])
      // All subtitles are found for this video
      expect(contentRes.subtitles).toHaveLength(5)
    })

    test('correct resolution retrieval', async () => {
      const { dump } = await setupScrapeClasses({ format: '', mwWikiPath: '/' })

      let htmlStr = `<video poster="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Gout.webm/300px--Gout.webm.jpg" controls="" preload="none" height="169" width="300" resource="./File:Gout.webm">
        <source src="//upload.wikimedia.org/wikipedia/commons/3/3d/Gout.webm" type="video/webm; codecs=&quot;vp9, vorbis&quot;" data-file-width="1920" data-file-height="1080" data-title="Original WebM file, 1,920 × 1,080 (735 kbps)" data-shorttitle="WebM source">
        <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.120p.vp9.webm" type="video/webm; codecs=&quot;vp9, opus&quot;" data-width="214" data-height="120" data-title="Lowest bandwidth VP9 (120P)" data-shorttitle="VP9 120P">
        <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.160p.webm" type="video/webm; codecs=&quot;vp8, vorbis&quot;" data-width="284" data-height="160" data-title="Low bandwidth WebM (160P)" data-shorttitle="WebM 160P">
        <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.180p.vp9.webm" type="video/webm; codecs=&quot;vp9, opus&quot;" data-width="320" data-height="180" data-title="Low bandwidth VP9 (180P)" data-shorttitle="VP9 180P">
        <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.240p.vp9.webm" type="video/webm; codecs=&quot;vp9, opus&quot;" data-width="426" data-height="240" data-title="Small VP9 (240P)" data-shorttitle="VP9 240P">
        <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.240p.webm" type="video/webm; codecs=&quot;vp8, vorbis&quot;" data-width="426" data-height="240" data-title="Small WebM (240P)" data-shorttitle="WebM 240P">
        <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.360p.vp9.webm" type="video/webm; codecs=&quot;vp9, opus&quot;" data-width="640" data-height="360" data-title="VP9 (360P)" data-shorttitle="VP9 360P">
        <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.360p.webm" type="video/webm; codecs=&quot;vp8, vorbis&quot;" data-width="640" data-height="360" data-title="WebM (360P)" data-shorttitle="WebM 360P">
        <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.480p.vp9.webm" type="video/webm; codecs=&quot;vp9, opus&quot;" data-width="854" data-height="480" data-title="SD VP9 (480P)" data-shorttitle="VP9 480P">
        <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.480p.webm" type="video/webm; codecs=&quot;vp8, vorbis&quot;" data-width="854" data-height="480" data-title="SD WebM (480P)" data-shorttitle="WebM 480P">
        <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.720p.vp9.webm" type="video/webm; codecs=&quot;vp9, opus&quot;" data-width="1280" data-height="720" data-title="HD VP9 (720P)" data-shorttitle="VP9 720P">
        <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.720p.webm" type="video/webm; codecs=&quot;vp8, vorbis&quot;" data-width="1280" data-height="720" data-title="HD WebM (720P)" data-shorttitle="WebM 720P">
        <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.1080p.vp9.webm" type="video/webm; codecs=&quot;vp9, opus&quot;" data-width="1920" data-height="1080" data-title="Full HD VP9 (1080P)" data-shorttitle="VP9 1080P">
        <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.1080p.webm" type="video/webm; codecs=&quot;vp8, vorbis&quot;" data-width="1920" data-height="1080" data-title="Full HD WebM (1080P)" data-shorttitle="WebM 1080P">
        <track kind="subtitles" type="text/x-srt" src="//commons.wikimedia.org/w/api.php?action=timedtext&amp;title=File%3AGout.webm&amp;lang=ar&amp;trackformat=srt&amp;origin=%2A" srclang="ar" label="العربية (ar)" data-mwtitle="" data-dir="rtl">
        <track kind="subtitles" type="text/vtt" src="//commons.wikimedia.org/w/api.php?action=timedtext&amp;title=File%3AGout.webm&amp;lang=ar&amp;trackformat=vtt&amp;origin=%2A" srclang="ar" label="العربية (ar)" data-mwtitle="" data-dir="rtl"></video>`
      let htmlDoc = domino.createDocument(htmlStr)
      let ret = await testableRenderer.testTreatVideo(dump, {}, 'Gout', htmlDoc.querySelector('video'), false)
      // Correct video resolution for width greater than videoEl
      expect(ret.mediaDependencies[1]).toEqual('https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.180p.vp9.webm')

      htmlStr = `<video poster="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Gout.webm/300px--Gout.webm.jpg" controls="" preload="none" height="169" width="800" resource="./File:Gout.webm">
    <source src="//upload.wikimedia.org/wikipedia/commons/3/3d/Gout.webm" type="video/webm; codecs=&quot;vp9, vorbis&quot;" data-file-width="700" data-file-height="1080" data-title="Original WebM file, 1,920 × 1,080 (735 kbps)" data-shorttitle="WebM source">
    <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.700p.vp9.webm" type="video/webm; codecs=&quot;vp9, opus&quot;" data-width="214" data-height="120" data-title="Lowest bandwidth VP9 (120P)" data-shorttitle="VP9 120P">
    <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.780p.webm" type="video/webm; codecs=&quot;vp8, vorbis&quot;" data-width="780" data-height="160" data-title="Low bandwidth WebM (160P)" data-shorttitle="WebM 160P">
    <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.320p.vp9.webm" type="video/webm; codecs=&quot;vp9, opus&quot;" data-width="320" data-height="180" data-title="Low bandwidth VP9 (180P)" data-shorttitle="VP9 180P">
    <track kind="subtitles" type="text/x-srt" src="//commons.wikimedia.org/w/api.php?action=timedtext&amp;title=File%3AGout.webm&amp;lang=ar&amp;trackformat=srt&amp;origin=%2A" srclang="ar" label="العربية (ar)" data-mwtitle="" data-dir="rtl">
    <track kind="subtitles" type="text/vtt" src="//commons.wikimedia.org/w/api.php?action=timedtext&amp;title=File%3AGout.webm&amp;lang=ar&amp;trackformat=vtt&amp;origin=%2A" srclang="ar" label="العربية (ar)" data-mwtitle="" data-dir="rtl"></video>`
      htmlDoc = domino.createDocument(htmlStr)
      ret = await testableRenderer.testTreatVideo(dump, {}, 'Gout', htmlDoc.querySelector('video'), false)
      // Correct video resolution for all widths less than videoEl
      expect(ret.mediaDependencies[1]).toEqual('https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.780p.webm')

      htmlStr = `<video poster="//upload.wikimedia.org/wikipedia/commons/thumb/2/23/Apollo_13_Houston%2C_We%27ve_Got_a_Problem.ogv/220px--Apollo_13_Houston%2C_We%27ve_Got_a_Problem.ogv.jpg" preload="none" height="165" width="220" resource="./File:Apollo_13_Houston,_We've_Got_a_Problem.ogv" controls="40">
    <source src="//upload.wikimedia.org/wikipedia/commons/2/23/Apollo_13_Houston%2C_We%27ve_Got_a_Problem.ogv" type="video/ogg; codecs=&quot;theora, vorbis&quot;" data-file-width="400" data-file-height="300" data-title="Original Ogg file, 400 × 300 (616 kbps)" data-shorttitle="Ogg source"></video>`
      htmlDoc = domino.createDocument(htmlStr)
      ret = await testableRenderer.testTreatVideo(dump, {}, 'Appolo_13', htmlDoc.querySelector('video'), false)
      // Remove video if no appropriate video/audio source
      expect(ret.mediaDependencies).toHaveLength(0)
    })

    test('Ogg audio retrival', async () => {
      const { dump } = await setupScrapeClasses({ format: '', mwWikiPath: '/' })
      const htmlStr = `<audio controls="" preload="none" height="32" width="200" resource="./File:William_Shakespeare_(Spoken_Article).ogg">
        <source src="//upload.wikimedia.org/wikipedia/commons/a/a1/William_Shakespeare_%28Spoken_Article%29.ogg" type="audio/ogg; codecs=&quot;vorbis&quot;" data-title="Original Ogg file (54 kbps)" data-shorttitle="Ogg source">
        <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/a/a1/William_Shakespeare_%28Spoken_Article%29.ogg/William_Shakespeare_%28Spoken_Article%29.ogg.mp3" type="audio/mpeg" data-title="MP3" data-shorttitle="MP3">
        </audio>`
      const htmlDoc = domino.createDocument(htmlStr)
      const ret = await testableRenderer.testTreatVideo(dump, {}, 'Michael_Jackson', htmlDoc.querySelector('audio'), false)
      // Correct audio file
      expect(ret.mediaDependencies[0]).toEqual('https://upload.wikimedia.org/wikipedia/commons/a/a1/William_Shakespeare_%28Spoken_Article%29.ogg')
    })
  })

  describe('treatMedias', () => {
    beforeAll(startRedis)
    afterAll(stopRedis)

    test('treatMedias format=""', async () => {
      const { downloader, dump } = await setupScrapeClasses({ format: '', mwWikiPath: '/' }) // en wikipedia

      const doc = domino.createDocument(html)

      const ret = await testableRenderer.testTreatMedias(doc, dump, 'Dendritic_cell', downloader.webp)

      const videoEl = ret.doc.querySelector('video')
      const videoPosterUrl = videoEl.getAttribute('poster')
      const sources: any[] = Array.from(videoEl.querySelectorAll('source'))
      const sourceUrl = sources[0].getAttribute('src')

      // Video poster correctly re-written
      expect(videoPosterUrl).toEqual('../I/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.jpg')
      // Source src correctly re-written
      expect(sourceUrl).toEqual('../I/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.120p.vp9.webm')

      const imgEl = ret.doc.querySelector('img')
      const imgSrc = imgEl.getAttribute('src')

      // Img src correctly re-written
      expect(imgSrc).toEqual('../I/Dendritic_cell_revealed.jpg')
    })

    test('treatMedias format="nopic"', async () => {
      const { downloader, dump } = await setupScrapeClasses({ format: 'nopic', mwWikiPath: '/' }) // en wikipedia

      const doc = domino.createDocument(html)

      const ret = await testableRenderer.testTreatMedias(doc, dump, 'Dendritic_cell', downloader.webp)

      const videoEl = ret.doc.querySelector('video')
      const imgEl = ret.doc.querySelector('img')

      // Video element removed in nopic
      expect(videoEl).toBeUndefined()
      // Img element removed in nopic
      expect(imgEl).toBeUndefined()
    })

    test('treatMedias format="novid"', async () => {
      const { downloader, dump } = await setupScrapeClasses({ format: 'novid', mwWikiPath: '/' }) // en wikipedia

      const doc = domino.createDocument(html)

      const ret = await testableRenderer.testTreatMedias(doc, dump, 'Dendritic_cell', downloader.webp)

      const videoEl = ret.doc.querySelector('video')
      const imgEl = ret.doc.querySelector('img')

      // Video element removed in novid
      expect(videoEl).toBeUndefined()
      // Img element not removed in novid
      expect(imgEl).toBeDefined()
    })
  })
})
