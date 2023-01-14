import { URL } from 'url';
import tmp from 'tmp';
import pathParser from 'path';
import { sanitize_customFlavour } from '../../src/sanitize-argument.js';
import { encodeArticleIdForZimHtmlUrl, interpolateTranslationString, getFullUrl,
  getMediaBase, isWebpCandidateImageUrl, normalizeMwResponse } from '../../src/util/index.js';
import { testHtmlRewritingE2e } from '../util.js';
import axios from 'axios';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {jest} from '@jest/globals';

jest.setTimeout(10000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Utils', () => {

  test('util -> interpolateTranslationString', async () => {
    expect(interpolateTranslationString('Hello world', {})).toEqual('Hello world');
    expect(interpolateTranslationString('Hello ${name}', { name: 'John' })).toEqual('Hello John');
    expect(interpolateTranslationString('Hello ${name} ${lastname}, bye ${name}', {
      name: 'John',
      lastname: 'Smith',
    })).toEqual('Hello John Smith, bye John');
  });

  test('Encoding ArticleId for Zim HTML Url', async () => {
    const articles = [
      'Que_faire_?', 'Que_faire_%3F',
      'Que_faire_?_(Lénine)', 'Que_faire_%3F_(L%C3%A9nine)',
      'Random_#hashtag', 'Random_%23hashtag',
      `Guidelines:Règles_d'édition`, `Guidelines%3AR%C3%A8gles_d'%C3%A9dition`,
      'Avanti!', 'Avanti!',
      'McCormick_Tribune_Plaza_&_Ice Rink', 'McCormick_Tribune_Plaza_%26_Ice%20Rink',
      '2_+_2_=_5', '2_%2B_2_%3D_5',
      `Guidelines:Règles d'édition`, `Guidelines%3AR%C3%A8gles%20d'%C3%A9dition`,
      'something/random/todo', 'something/random/todo',
      'Michael_Jackson', 'Michael_Jackson',
      '/dev/null', './/dev/null',
      `0`, `0`,
      undefined, undefined,
      null, null,
    ];

    while (articles.length) {
      const unencoded = articles.shift();
      const encoded = articles.shift();
      expect(`${encoded}`).toEqual(encodeArticleIdForZimHtmlUrl(`${unencoded}`));
    }
  });

  test('wikitext comparison', async () => {
    testHtmlRewritingE2e(
      `An [[isolated system]] remains the system is free.`,
      `<p id="mwAQ">An <a rel="mw:WikiLink" href="./Isolated_system" title="Isolated system" id="mwAg">isolated system</a> remains the system is free.</p>`,
    )
  })

  test('Get full URL', async () => {
    // Full URL for styles
    expect(getFullUrl('/w/load.php?lang=bm&modules=site.styles&only=styles&skin=vector', new URL('https://bm.wikipedia.org/')))
      .toEqual('https://bm.wikipedia.org/w/load.php?lang=bm&modules=site.styles&only=styles&skin=vector');

    // Full URL for image
    expect(getFullUrl('/w/resources/src/mediawiki.skinning/images/spinner.gif?ca65b', new URL('https://bm.wikipedia.org/w/load.php?lang=bm&modules=ext.uls.interlanguage%7Cext.visualEditor.desktopArticleTarget.noscript%7Cext.wikimediaBadges%7Cskins.vector.styles.legacy%7Cwikibase.client.init&only=styles&skin=vector')))
      .toEqual('https://bm.wikipedia.org/w/resources/src/mediawiki.skinning/images/spinner.gif?ca65b');

    // Full Url for relative path with skipping one file
    expect(getFullUrl('./-/mw/jsConfigVars.js', new URL('https://bm.wikipedia.org/'))).toEqual('https://bm.wikipedia.org/-/mw/jsConfigVars.js');

    // Full Url for relative path with skipping one folder
    expect(getFullUrl('../-/mw/jsConfigVars.js', 'https://bm.wikipedia.org/')).toEqual('https://bm.wikipedia.org/-/mw/jsConfigVars.js');

    // Full Url when base and url both strtas with http/s
    expect(getFullUrl('https://wikimedia.org/api/rest_v1/media/math/render/svg/34cbb1e27dae0c04fc794a91f2aa001aca7054c1', 'https://en.wikipedia.org/'))
      .toEqual('https://wikimedia.org/api/rest_v1/media/math/render/svg/34cbb1e27dae0c04fc794a91f2aa001aca7054c1');
  })

  test('Custom flavour path', async () => {

    // checks in current working directory.
    const tmpObj = tmp.fileSync({ postfix: '.js' });
    process.chdir(pathParser.resolve(tmpObj.name, '../'));

    // Custom flavour in working directory.
    expect(sanitize_customFlavour(tmpObj.name)).toEqual(pathParser.resolve(process.cwd(), tmpObj.name));

    // checks in extension directory.
    expect(sanitize_customFlavour('wiktionary_fr.js')).toEqual(pathParser.resolve(__dirname, '../../extensions/wiktionary_fr.js'));

    // Custom flavour in extension directory without js extension.
    expect(sanitize_customFlavour('wiktionary_fr')).toEqual(pathParser.resolve(__dirname, '../../extensions/wiktionary_fr.js'));

    // checks in absolute path.
    expect(sanitize_customFlavour(pathParser.resolve(__dirname, '../../extensions/wiktionary_fr.js')))
      .toEqual(pathParser.resolve(__dirname, '../../extensions/wiktionary_fr.js'));

    // Negative test for absolute path.
    expect(sanitize_customFlavour(pathParser.resolve(__dirname, '../../extensions/negativeTest.js'))).toBeNull();

    // negative scenario
    expect(sanitize_customFlavour('wrongCustomFlavour.js')).toBeNull();
  })

  test('getMediaBase tests', async () => {

    // Thumbs
    // Thumb 1
    expect(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Westminstpalace.jpg/220px-Westminstpalace.jpg', true)).toEqual('Westminstpalace.jpg');
    // No thumb
    expect(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/3/39/Westminstpalace.jpg', true)).toEqual('Westminstpalace.jpg');
    // SVG
    expect(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/0/0d/VFPt_Solenoid_correct2.svg', true)).toEqual('VFPt_Solenoid_correct2.svg');
    // SVG PNG thumb
    expect(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/VFPt_Solenoid_correct2.svg/120px-VFPt_Solenoid_correct2.svg.png', true)).toEqual('VFPt_Solenoid_correct2.svg.png');
    // Video poster
    expect(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/120px--S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.jpg', true)).toEqual('S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.jpg');
    // Escaped UR
    expect(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/c/c6/De-Z%C3%BCrich.ogg', false)).toEqual('De-Zürich.ogg');
    // Long thumb
    expect(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/US_Navy_070406-N-2959L-756_Members_of_USS_Ronald_Reagan_%28CVN_76%29_First_Class_Association_prepare_and_put_toppings_on_pizzas_in_the_galley_as_part_of_a_special_dinner_prepared_for_the_crew.jpg/169px-thumbnail.jpg', true)).toEqual('US_Navy_070406-N-2959L-756_Members_of_USS_Ronald_Reagan_(CVN_76)_First_Class_Association_prepare_and_put_toppings_on_pizzas_in_the_galley_as_part_of_a_special_dinner_prepared_for_the_crew.jpg');
    // Long thumb with SVG PNG
    expect(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/US_Navy_070406-N-2959L-756_Members_of_USS_Ronald_Reagan_%28CVN_76%29_First_Class_Association_prepare_and_put_toppings_on_pizzas_in_the_galley_as_part_of_a_special_dinner_prepared_for_the_crew.svg/169px-thumbnail.svg.png', true)).toEqual('US_Navy_070406-N-2959L-756_Members_of_USS_Ronald_Reagan_(CVN_76)_First_Class_Association_prepare_and_put_toppings_on_pizzas_in_the_galley_as_part_of_a_special_dinner_prepared_for_the_crew.svg.png');

    // Latex (equations)
    expect(getMediaBase('https://wikimedia.org/api/rest_v1/media/math/render/svg/da47d67ac8dcb0be8b68d7bfdc676d9ce9bf1606', true)).toEqual('da47d67ac8dcb0be8b68d7bfdc676d9ce9bf1606.svg');

    // WikiHiero (hieroglyphs)
    // WikiHiero png with URL args
    expect(getMediaBase('https://en.wikipedia.org/w/extensions/wikihiero/img/hiero_G1.png?4d556', false)).toEqual('hiero_G1.png');
    // WikiHiero png without URL args
    expect(getMediaBase('https://en.wikipedia.org/w/extensions/wikihiero/img/hiero_G1.png', false)).toEqual('hiero_G1.png');

    // Score - is default behaviour
    expect(getMediaBase('https://upload.wikimedia.org/score/6/c/6clze8fxoo65795idk91426rskovmgp/6clze8fx.png', false)).toEqual('012a83318ce8d3a438dbed3127b9e339.png');

    // Graphoid (charts) - is default behaviour
    expect(getMediaBase('https://en.wikipedia.org/api/rest_v1/page/graph/png/COVID-19_pandemic_in_the_United_Kingdom/0/28fe8c45f73e8cc60d45086655340f49cdfd37d0.png', true)).toEqual('43ffd82a8ffc4755312c22950fde7ac5.png');

    // Fandom
    expect(getMediaBase('https://static.wikia.nocookie.net/minecraft_de_gamepedia/images/e/ee/Diamantschwert_%28Dungeons%29.png/revision/latest/scale-to-width-down/60?cb=20200409173531', true)).toEqual('Diamantschwert_(Dungeons).png');

    // Default behaviour
    expect(getMediaBase('https://maps.wikimedia.org/img/osm-intl,9,52.2789,8.0431,300x300.png?lang=ar&amp;domain=ar.wikipedia.org&amp;title=%D8%A3%D9%88%D8%B3%D9%86%D8%A7%D8%A8%D8%B1%D9%88%D9%83&amp;groups=_0a30d0118ec7c477895dffb596ad2b875958c8fe', true)).toEqual('589fd4e3821c15d4fcebcedf2effd5b0.png');
  })

  test('isWebpCandidateImageUrl tests', async () => {

    // Thumbs
    // Thumb 1
    expect(isWebpCandidateImageUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Westminstpalace.jpg/220px-Westminstpalace.jpg')).toBeTruthy();
    // No thumb'
    expect(isWebpCandidateImageUrl('https://upload.wikimedia.org/wikipedia/commons/3/39/Westminstpalace.jpg')).toBeTruthy();
    // SVG
    expect(isWebpCandidateImageUrl('https://upload.wikimedia.org/wikipedia/commons/0/0d/VFPt_Solenoid_correct2.svg')).toBeFalsy();
    // SVG PNG thumb
    expect(isWebpCandidateImageUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/VFPt_Solenoid_correct2.svg/120px-VFPt_Solenoid_correct2.svg.png')).toBeTruthy();
    // Video poster
    expect(isWebpCandidateImageUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/120px--S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.jpg')).toBeTruthy();
    // OGG file
    expect(isWebpCandidateImageUrl('https://upload.wikimedia.org/wikipedia/commons/c/c6/De-Z%C3%BCrich.ogg')).toBeFalsy();
    // Long thumb
    expect(isWebpCandidateImageUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/US_Navy_070406-N-2959L-756_Members_of_USS_Ronald_Reagan_%28CVN_76%29_First_Class_Association_prepare_and_put_toppings_on_pizzas_in_the_galley_as_part_of_a_special_dinner_prepared_for_the_crew.jpg/169px-thumbnail.jpg')).toBeTruthy();
    // Long thumb with SVG PNG
    expect(isWebpCandidateImageUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/US_Navy_070406-N-2959L-756_Members_of_USS_Ronald_Reagan_%28CVN_76%29_First_Class_Association_prepare_and_put_toppings_on_pizzas_in_the_galley_as_part_of_a_special_dinner_prepared_for_the_crew.svg/169px-thumbnail.svg.png')).toBeTruthy();

    // Latex (equations)
    expect(isWebpCandidateImageUrl('https://wikimedia.org/api/rest_v1/media/math/render/svg/da47d67ac8dcb0be8b68d7bfdc676d9ce9bf1606')).toBeFalsy();

    // WikiHiero (hieroglyphs)
    // WikiHiero png with URL args
    expect(isWebpCandidateImageUrl('https://en.wikipedia.org/w/extensions/wikihiero/img/hiero_G1.png?4d556')).toBeTruthy();
    // WikiHiero png without URL args
    expect(isWebpCandidateImageUrl('https://en.wikipedia.org/w/extensions/wikihiero/img/hiero_G1.png')).toBeTruthy();

    // Score - is default behaviour
    expect(isWebpCandidateImageUrl('https://upload.wikimedia.org/score/6/c/6clze8fxoo65795idk91426rskovmgp/6clze8fx.png')).toBeTruthy();

    // Graphoid (charts) - is default behaviour
    expect(isWebpCandidateImageUrl('https://en.wikipedia.org/api/rest_v1/page/graph/png/COVID-19_pandemic_in_the_United_Kingdom/0/28fe8c45f73e8cc60d45086655340f49cdfd37d0.png')).toBeTruthy();

    // Fandom
    expect(isWebpCandidateImageUrl('https://static.wikia.nocookie.net/minecraft_de_gamepedia/images/e/ee/Diamantschwert_%28Dungeons%29.png/revision/latest/scale-to-width-down/60?cb=20200409173531')).toBeTruthy();

    // Default behaviour
    expect(isWebpCandidateImageUrl('https://maps.wikimedia.org/img/osm-intl,9,52.2789,8.0431,300x300.png?lang=ar&amp;domain=ar.wikipedia.org&amp;title=%D8%A3%D9%88%D8%B3%D9%86%D8%A7%D8%A8%D8%B1%D9%88%D9%83&amp;groups=_0a30d0118ec7c477895dffb596ad2b875958c8fe')).toBeTruthy();
  })

  test('No title normalisation', async () => {
    const resp = await axios.get<MwApiResponse>('https://en.wiktionary.org/w/api.php?action=query&format=json&prop=redirects|revisions|pageimages&rdlimit=max&rdnamespace=0&redirects=true&titles=constructor', { responseType: 'json', });
    const normalizedObject = normalizeMwResponse(resp.data.query);
    // normalizeMwResponse returns title constructor
    expect(Object.keys(normalizedObject)[0]).toEqual('constructor');
  })
})