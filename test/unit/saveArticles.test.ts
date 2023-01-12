import { startRedis, stopRedis } from './bootstrap';
import domino from 'domino';

import { setupScrapeClasses, convertWikicodeToHtml, testHtmlRewritingE2e } from '../util';
import { articleDetailXId } from '../../src/stores';
import { saveArticles, treatMedias, applyOtherTreatments, treatSubtitle, treatVideo } from '../../src/util/saveArticles';
import { ZimArticle } from '@openzim/libzim';
import { Dump } from '../../src/Dump';
import { mwRetToArticleDetail, renderDesktopArticle, DELETED_ARTICLE_ERROR } from '../../src/util/index';
import {jest} from '@jest/globals';

jest.setTimeout(20000);

describe('saveArticles', () => {

  beforeAll(startRedis);
  afterAll(stopRedis);

  const html = `
    <img src=\"//upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Dendritic_cell_revealed.jpg/250px-Dendritic_cell_revealed.jpg\" data-file-width=\"3000\" data-file-height=\"2250\" data-file-type=\"bitmap\" height=\"188\" width=\"250\" srcset=\"//upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Dendritic_cell_revealed.jpg/500px-Dendritic_cell_revealed.jpg 2x, //upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Dendritic_cell_revealed.jpg/375px-Dendritic_cell_revealed.jpg 1.5x\">
    <video poster=\"//upload.wikimedia.org/wikipedia/commons/thumb/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/120px--S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.jpg\" preload=\"none\" height=\"115\" width=\"120\" resource=\"./File:S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv\" type=\"video/ogg; codecs=&quot;theora&quot;\" data-file-width=\"264\" data-file-height=\"254\" data-title=\"Original Ogg file, 264 × 254 (501 kbps)\" data-shorttitle=\"Ogg source\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.120p.vp9.webm\" type=\"video/webm; codecs=&quot;vp9, opus&quot;\" data-width=\"124\" data-height=\"120\" data-title=\"Lowest bandwidth VP9 (120P)\" data-shorttitle=\"VP9 120P\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.160p.webm\" type=\"video/webm; codecs=&quot;vp8, vorbis&quot;\" data-width=\"166\" data-height=\"160\" data-title=\"Low bandwidth WebM (160P)\" data-shorttitle=\"WebM 160P\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.180p.vp9.webm\" type=\"video/webm; codecs=&quot;vp9, opus&quot;\" data-width=\"188\" data-height=\"180\" data-title=\"Low bandwidth VP9 (180P)\" data-shorttitle=\"VP9 180P\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.240p.vp9.webm\" type=\"video/webm; codecs=&quot;vp9, opus&quot;\" data-width=\"250\" data-height=\"240\" data-title=\"Small VP9 (240P)\" data-shorttitle=\"VP9 240P\"><source src=\"https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.240p.webm\" type=\"video/webm; codecs=&quot;vp8, vorbis&quot;\" data-width=\"250\" data-height=\"240\" data-title=\"Small WebM (240P)\" data-shorttitle=\"WebM 240P\"></video>
`;

  test('Article html processing', async () => {
    const { downloader, mw, dump } = await setupScrapeClasses(); // en wikipedia
    await downloader.checkCapabilities();
    await downloader.setBaseUrls();
    const _articlesDetail = await downloader.getArticleDetailsIds(['London']);
    const articlesDetail = mwRetToArticleDetail(_articlesDetail);
    await articleDetailXId.flush();
    await articleDetailXId.setMany(articlesDetail);

    const [{ html }] = await downloader.getArticle('London', dump);

    const addedArticles: typeof ZimArticle[] = [];

    // TODO: use proper spied (like sinon.js)
    await saveArticles({
      addArticle(article: typeof ZimArticle) {
        if (article.mimeType === 'text/html') {
          addedArticles.push(article);
        }
        return Promise.resolve();
      }
    } as any,
      downloader,
      mw,
      dump,
    );

    // Successfully scrapped existent articles
    expect(addedArticles).toHaveLength(1);
    expect(addedArticles[0].aid).toEqual('A/London');

    await expect(downloader.getArticle('non-existent-article', dump)).rejects.toThrowError('');

    const articleDoc = domino.createDocument(addedArticles.shift().bufferData.toString());

    // Successfully scrapped existent articles
    expect(articleDoc.querySelector('meta[name="geo.position"]')).toBeDefined();
    // Geo Position data is correct
    expect(articleDoc.querySelector('meta[name="geo.position"]')?.getAttribute('content')).toEqual('51.50722222;-0.1275');
  });

  describe('applyOtherTreatments', () => {
    let dump: Dump;
    let dump2: Dump;
    let articleHtml: string;

    beforeEach( async () => {
      const classes = await setupScrapeClasses({ mwUrl: 'https://en.wikivoyage.org' }); // en wikipedia
      dump = classes.dump
      const downloader = classes.downloader

      await downloader.checkCapabilities();
      await downloader.setBaseUrls();
      const _articleDetailsRet = await downloader.getArticleDetailsIds(['Western_Greenland']);
      const articlesDetail = mwRetToArticleDetail(_articleDetailsRet);
      articleDetailXId.setMany(articlesDetail);
      [{ html: articleHtml }] = await downloader.getArticle('Western_Greenland', dump);
      dump2 = new Dump('', { keepEmptyParagraphs: true } as any, dump.mwMetaData);
    });

    test('Found no empty details elements when they should be stripped in mobile view', async () => {
      const doc = domino.createDocument(articleHtml);
      await applyOtherTreatments(doc, dump);

      const details = Array.from(doc.querySelectorAll('details'));
      let fewestChildren = 0;
      for (const d of details) {
        if (fewestChildren === 0 || d.children.length < fewestChildren) {
          fewestChildren = d.children.length;
        }
      }
      expect(fewestChildren).toBeGreaterThan(0);
    });

    test('Found empty details elements when they should be left im mobile view', async () => {
      const doc = domino.createDocument(articleHtml);
      await applyOtherTreatments(doc, dump2);

      const details = Array.from(doc.querySelectorAll('details'));

      let fewestChildren = 0;
      for (const d of details) {
        if (fewestChildren === 0 || d.children.length < fewestChildren) {
          fewestChildren = d.children.length;
        }
      }
      expect(fewestChildren).toBeLessThanOrEqual(1);
    });

    test('Found empty sections when they should be left im desktop view', async () => {
      const doc = domino.createDocument(articleHtml);
      await applyOtherTreatments(doc, dump2);

      const sections = Array.from(doc.querySelectorAll('section'));

      let fewestChildren = 0;
      for (const d of sections) {
        if (fewestChildren === 0 || d.children.length < fewestChildren) {
          fewestChildren = d.children.length;
        }
      }
      expect(fewestChildren).toBeLessThanOrEqual(1);
    });
  });

  test('treatMedias format=""', async () => {
    const { downloader, mw, dump } = await setupScrapeClasses({ format: '' }); // en wikipedia

    const doc = domino.createDocument(html);

    const ret = await treatMedias(doc, mw, dump, 'Dendritic_cell', downloader);

    const videoEl = ret.doc.querySelector('video');
    const videoPosterUrl = videoEl.getAttribute('poster');
    const sources: any[] = Array.from(videoEl.querySelectorAll('source'));
    const sourceUrl = sources[0].getAttribute('src');

    // Video poster correctly re-written
    expect(videoPosterUrl).toEqual('../I/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.jpg');
    // Source src correctly re-written
    expect(sourceUrl).toEqual('../I/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.120p.vp9.webm');

    const imgEl = ret.doc.querySelector('img');
    const imgSrc = imgEl.getAttribute('src');

    // Img src correctly re-written
    expect(imgSrc).toEqual('../I/Dendritic_cell_revealed.jpg');
  });

  test('treatMedias format="nopic"', async () => {
    const { downloader, mw, dump } = await setupScrapeClasses({ format: 'nopic' }); // en wikipedia

    const doc = domino.createDocument(html);

    const ret = await treatMedias(doc, mw, dump, 'Dendritic_cell', downloader);

    const videoEl = ret.doc.querySelector('video');
    const imgEl = ret.doc.querySelector('img');

    // Video element removed in nopic
    expect(videoEl).toBeUndefined();
    // Img element removed in nopic
    expect(imgEl).toBeUndefined();
  });

  test('treatMedias format="novid"', async () => {
    const { downloader, mw, dump } = await setupScrapeClasses({ format: 'novid' }); // en wikipedia

    const doc = domino.createDocument(html);

    const ret = await treatMedias(doc, mw, dump, 'Dendritic_cell', downloader);

    const videoEl = ret.doc.querySelector('video');
    const imgEl = ret.doc.querySelector('img');

    // Video element removed in novid
    expect(videoEl).toBeUndefined();
    // Img element not removed in novid
    expect(imgEl).toBeDefined();
  });

  test('--customFlavour', async () => {
    const { downloader, mw, dump } = await setupScrapeClasses({ format: 'nopic' }); // en wikipedia
    await downloader.checkCapabilities();
    await downloader.setBaseUrls();
    class CustomFlavour implements CustomProcessor {
      public async shouldKeepArticle(articleId: string, doc: Document) {
        return articleId !== 'London';
      }
      public async preProcessArticle(articleId: string, doc: Document) {
        if (articleId === 'Paris') {
          const h2 = doc.createElement('h2');
          h2.textContent = 'INSERTED_BY_PRE_PROCESSOR';
          h2.id = 'PRE_PROCESSOR';
          doc.body.appendChild(h2);
        }
        return doc;
      }
      public async postProcessArticle(articleId: string, doc: Document) {
        if (articleId === 'Prague') {
          const h2 = doc.createElement('h2');
          h2.textContent = 'INSERTED_BY_POST_PROCESSOR';
          h2.id = 'POST_PROCESSOR';
          doc.body.appendChild(h2);
        }
        return doc;
      }
    }
    const customFlavour = new CustomFlavour();
    dump.customProcessor = customFlavour;

    const _articlesDetail = await downloader.getArticleDetailsIds(['London', 'Paris', 'Prague']);
    const articlesDetail = mwRetToArticleDetail(_articlesDetail);
    await articleDetailXId.flush();
    await articleDetailXId.setMany(articlesDetail);

    const writtenArticles: any = {};
    await saveArticles({
      addArticle(article: typeof ZimArticle) {
        if (article.mimeType === 'text/html') {
          writtenArticles[article.title] = article;
        }
        return Promise.resolve();
      },
    } as any,
      downloader,
      mw,
      dump,
    );

    const ParisDocument = domino.createDocument(writtenArticles.Paris.bufferData);
    const PragueDocument = domino.createDocument(writtenArticles.Prague.bufferData);

    // London was correctly filtered out by customFlavour
    expect(writtenArticles.London).toBeUndefined();
    // Paris was correctly pre-processed
    expect(ParisDocument.querySelector('#PRE_PROCESSOR')).toBeDefined();
    // Prague was correctly post-processed
    expect(PragueDocument.querySelector('#POST_PROCESSOR')).toBeDefined();
  });

  test('treat one subtitle', async () => {
    const { downloader, mw, dump } = await setupScrapeClasses({ format: '' });

    // Wikicode is taken from article "Mechanical energy" which has a video with subtitle
    const wikicode = `[[File:Physicsworks.ogv|thumb|200px|alt="Lecture demonstrating conservation of mechanical energy"|MIT professor [[Walter Lewin]] demonstrating conservation of mechanical energy]]`;
    const htmlStr = await convertWikicodeToHtml(wikicode, dump.mwMetaData.baseUrl);

    const htmlDoc = domino.createDocument(htmlStr.data);
    const contentRes = await treatSubtitle(htmlDoc.querySelector('track'), mw, 'Mechanical energy');
    // Converted wikicode to HTML for one subtitle
    testHtmlRewritingE2e(wikicode, htmlStr.data);
    // Video subtitle rewriting matches
    expect(contentRes).toEqual('https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3APhysicsworks.ogv&lang=en&trackformat=vtt&origin=*');
  });

  test('treat multiple subtitles in one video', async () => {
    const { mw, dump } = await setupScrapeClasses({ format: '' });

    // Wikicode is taken from article "User:Charliechlorine/sandbox" which has multiple(4) subtitles in this video
    const wikicode = `[[File:Videoonwikipedia.ogv|thumb|thumbtime=0:58|left|320px|Video about kola nuts ]]`;
    const htmlStr = await convertWikicodeToHtml(wikicode, dump.mwMetaData.baseUrl);

    const htmlDoc = domino.createDocument(htmlStr.data);
    const contentRes = await treatVideo(mw, dump, {}, 'User:Charliechlorine/sandbox', htmlDoc.querySelector('video'), false);
    // Converted wikicode to HTML for multiple subtitle
    testHtmlRewritingE2e(wikicode, htmlStr.data);
    // Video multiple subtitles rewriting matches
    expect(contentRes.subtitles).toEqual(
      ['https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3AVideoonwikipedia.ogv&lang=en&trackformat=vtt&origin=*',
        'https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3AVideoonwikipedia.ogv&lang=eu&trackformat=vtt&origin=*',
        'https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3AVideoonwikipedia.ogv&lang=fa&trackformat=vtt&origin=*',
        'https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3AVideoonwikipedia.ogv&lang=fr&trackformat=vtt&origin=*',
        'https://commons.wikimedia.org/w/api.php?action=timedtext&title=File%3AVideoonwikipedia.ogv&lang=sv&trackformat=vtt&origin=*',
      ]);
    // All subtitles are found for this video
    expect(contentRes.subtitles).toHaveLength(5);
  });

  test('correct resolution retrieval', async () => {
    const { mw, dump } = await setupScrapeClasses({ format: '' });

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
        <track kind="subtitles" type="text/vtt" src="//commons.wikimedia.org/w/api.php?action=timedtext&amp;title=File%3AGout.webm&amp;lang=ar&amp;trackformat=vtt&amp;origin=%2A" srclang="ar" label="العربية (ar)" data-mwtitle="" data-dir="rtl"></video>`;
    let htmlDoc = domino.createDocument(htmlStr);
    let ret = await treatVideo(mw, dump, {}, 'Gout', htmlDoc.querySelector('video'), false);
    // Correct video resolution for width greater than videoEl
    expect(ret.mediaDependencies[1]).toEqual('https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.180p.vp9.webm');

    htmlStr = `<video poster="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Gout.webm/300px--Gout.webm.jpg" controls="" preload="none" height="169" width="800" resource="./File:Gout.webm">
    <source src="//upload.wikimedia.org/wikipedia/commons/3/3d/Gout.webm" type="video/webm; codecs=&quot;vp9, vorbis&quot;" data-file-width="700" data-file-height="1080" data-title="Original WebM file, 1,920 × 1,080 (735 kbps)" data-shorttitle="WebM source">
    <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.700p.vp9.webm" type="video/webm; codecs=&quot;vp9, opus&quot;" data-width="214" data-height="120" data-title="Lowest bandwidth VP9 (120P)" data-shorttitle="VP9 120P">
    <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.780p.webm" type="video/webm; codecs=&quot;vp8, vorbis&quot;" data-width="780" data-height="160" data-title="Low bandwidth WebM (160P)" data-shorttitle="WebM 160P">
    <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.320p.vp9.webm" type="video/webm; codecs=&quot;vp9, opus&quot;" data-width="320" data-height="180" data-title="Low bandwidth VP9 (180P)" data-shorttitle="VP9 180P">
    <track kind="subtitles" type="text/x-srt" src="//commons.wikimedia.org/w/api.php?action=timedtext&amp;title=File%3AGout.webm&amp;lang=ar&amp;trackformat=srt&amp;origin=%2A" srclang="ar" label="العربية (ar)" data-mwtitle="" data-dir="rtl">
    <track kind="subtitles" type="text/vtt" src="//commons.wikimedia.org/w/api.php?action=timedtext&amp;title=File%3AGout.webm&amp;lang=ar&amp;trackformat=vtt&amp;origin=%2A" srclang="ar" label="العربية (ar)" data-mwtitle="" data-dir="rtl"></video>`;
    htmlDoc = domino.createDocument(htmlStr);
    ret = await treatVideo(mw, dump, {}, 'Gout', htmlDoc.querySelector('video'), false);
    // Correct video resolution for all widths less than videoEl
    expect(ret.mediaDependencies[1]).toEqual('https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Gout.webm/Gout.webm.780p.webm')

    htmlStr = `<video poster="//upload.wikimedia.org/wikipedia/commons/thumb/2/23/Apollo_13_Houston%2C_We%27ve_Got_a_Problem.ogv/220px--Apollo_13_Houston%2C_We%27ve_Got_a_Problem.ogv.jpg" preload="none" height="165" width="220" resource="./File:Apollo_13_Houston,_We've_Got_a_Problem.ogv" controls="40">
    <source src="//upload.wikimedia.org/wikipedia/commons/2/23/Apollo_13_Houston%2C_We%27ve_Got_a_Problem.ogv" type="video/ogg; codecs=&quot;theora, vorbis&quot;" data-file-width="400" data-file-height="300" data-title="Original Ogg file, 400 × 300 (616 kbps)" data-shorttitle="Ogg source"></video>`;
    htmlDoc = domino.createDocument(htmlStr);
    ret = await treatVideo(mw, dump, {}, 'Appolo_13', htmlDoc.querySelector('video'), false);
    // Remove video if no appropriate video/audio source
    expect(ret.mediaDependencies).toHaveLength(0);
  })

  test('Ogg audio retrival', async () => {
    const { mw, dump } = await setupScrapeClasses({ format: '' });
    const htmlStr = `<audio controls="" preload="none" height="32" width="200" resource="./File:William_Shakespeare_(Spoken_Article).ogg">
        <source src="//upload.wikimedia.org/wikipedia/commons/a/a1/William_Shakespeare_%28Spoken_Article%29.ogg" type="audio/ogg; codecs=&quot;vorbis&quot;" data-title="Original Ogg file (54 kbps)" data-shorttitle="Ogg source">
        <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/a/a1/William_Shakespeare_%28Spoken_Article%29.ogg/William_Shakespeare_%28Spoken_Article%29.ogg.mp3" type="audio/mpeg" data-title="MP3" data-shorttitle="MP3">
        </audio>`
    const htmlDoc = domino.createDocument(htmlStr);
    const ret = await treatVideo(mw, dump, {}, 'Michael_Jackson', htmlDoc.querySelector('audio'), false);
    // Correct audio file
    expect(ret.mediaDependencies[0]).toEqual('https://upload.wikimedia.org/wikipedia/commons/a/a1/William_Shakespeare_%28Spoken_Article%29.ogg');
  })

  test('Test deleted article rendering', async () => {
    const articleJsonObject = {
      'visualeditor': { 'oldid': 0 }
    };
    // Throwing error if article is deleted
    expect(() => renderDesktopArticle(articleJsonObject, 'deletedArticle', { title: 'deletedArticle' })).toThrow(new Error(DELETED_ARTICLE_ERROR));
  });

});
