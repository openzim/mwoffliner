import './bootstrap.test';
import test from 'blue-tape';
import { URL } from 'url';
import tmp from 'tmp';
import pathParser from 'path';
import { sanitize_customFlavour } from 'src/sanitize-argument';
import { encodeArticleIdForZimHtmlUrl, interpolateTranslationString, getFullUrl } from 'src/util';
import { testHtmlRewritingE2e } from 'test/util';
import { getMediaBase, normalizeMwResponse, getSectionHtml } from '../../src/util/';
import axios from 'axios';
import { Dump } from '../../src/Dump';

test('util -> interpolateTranslationString', async (t) => {
    t.equals(interpolateTranslationString('Hello world', {}), 'Hello world');
    t.equals(interpolateTranslationString('Hello ${name}', { name: 'John' }), 'Hello John');
    t.equals(interpolateTranslationString('Hello ${name} ${lastname}, bye ${name}', {
        name: 'John',
        lastname: 'Smith',
    }), 'Hello John Smith, bye John');
});

test('Encoding ArticleId for Zim HTML Url', async(t) => {
     const articles = [
        'Que_faire_?',                        'Que_faire_%3F',
        'Que_faire_?_(Lénine)',               'Que_faire_%3F_(L%C3%A9nine)',
        'Random_#hashtag',                    'Random_%23hashtag',
        `Guidelines:Règles_d'édition`,        `Guidelines%3AR%C3%A8gles_d'%C3%A9dition`,
        'Avanti!',                            'Avanti!',
        'McCormick_Tribune_Plaza_&_Ice Rink', 'McCormick_Tribune_Plaza_%26_Ice%20Rink',
        '2_+_2_=_5',                          '2_%2B_2_%3D_5',
        `Guidelines:Règles d'édition`,        `Guidelines%3AR%C3%A8gles%20d'%C3%A9dition`,
        'something/random/todo',              'something/random/todo',
        'Michael_Jackson',                    'Michael_Jackson',
        '/dev/null',                          './/dev/null',
        `0`,                                  `0`,
        undefined,                            undefined,
        null,                                 null,
    ];

    while (articles.length) {
        const unencoded = articles.shift();
        const   encoded = articles.shift();
        t.equal(encoded, encodeArticleIdForZimHtmlUrl(unencoded), `encodeArticleIdForZimHtmlUrl() encoding`);
    }
});

test('Article section rendering', async (t) => {
    const dump: Dump = new Dump('', {} as any, {} as any);
    const sections = [
        {
          id: 1,
          text: 'level 1',
          toclevel: 1,
          line: 'Approximate Hamiltonians',
          anchor: 'Approximate_Hamiltonians'
        },
        {
          id: 2,
          text: 'level 1',
          toclevel: 1,
          line: 'Applying perturbation theory',
          anchor: 'Applying_perturbation_theory'
        },
        {
          id: 3,
          text: 'level 2',
          toclevel: 2,
          line: 'Limitations',
          anchor: 'Limitations'
        },
        {
          id: 4,
          text: 'level 3',
          toclevel: 3,
          line: 'Large perturbations',
          anchor: 'Large_perturbations'
        },
        {
          id: 5,
          text: 'level 3',
          toclevel: 3,
          line: 'Non-adiabatic states',
          anchor: 'Non-adiabatic_states'
        }
    ];
    t.equal(getSectionHtml(sections, 1, dump), `<details data-level="2" open>\n    <summary class=\'section-heading\'><h2 id="Approximate_Hamiltonians">Approximate Hamiltonians</h2></summary>\n    level 1\n    \n</details><details data-level="2" open>\n    <summary class=\'section-heading\'><h2 id="Applying_perturbation_theory">Applying perturbation theory</h2></summary>\n    level 1\n    <details data-level="2" open>\n    <summary class=\'section-heading\'><h2 id="Limitations">Limitations</h2></summary>\n    level 2\n    <details data-level="2" open>\n    <summary class=\'section-heading\'><h2 id="Large_perturbations">Large perturbations</h2></summary>\n    level 3\n    \n</details><details data-level="2" open>\n    <summary class=\'section-heading\'><h2 id="Non-adiabatic_states">Non-adiabatic states</h2></summary>\n    level 3\n    \n</details>\n</details>\n</details>`,
        'Tree structure in article sections');
});

test('wikitext comparison', async(t) => {
    testHtmlRewritingE2e(
        t,
        `An [[isolated system]] remains the system is free.`,
        `<p id="mwAQ">An <a rel="mw:WikiLink" href="./Isolated_system" title="Isolated system" id="mwAg">isolated system</a> remains the system is free.</p>`,
        'HTML and Wikitext match')
})

test('Get full URL', async(t) => {

    t.equal(getFullUrl('/w/load.php?lang=bm&modules=site.styles&only=styles&skin=vector', new URL('https://bm.wikipedia.org/')),
            'https://bm.wikipedia.org/w/load.php?lang=bm&modules=site.styles&only=styles&skin=vector',
            'Full URL for styles');

    t.equal(getFullUrl('/w/resources/src/mediawiki.skinning/images/spinner.gif?ca65b', new URL('https://bm.wikipedia.org/w/load.php?lang=bm&modules=ext.uls.interlanguage%7Cext.visualEditor.desktopArticleTarget.noscript%7Cext.wikimediaBadges%7Cskins.vector.styles.legacy%7Cwikibase.client.init&only=styles&skin=vector')),
            'https://bm.wikipedia.org/w/resources/src/mediawiki.skinning/images/spinner.gif?ca65b',
            'Full URL for image');

    t.equal(getFullUrl('./-/mw/jsConfigVars.js', new URL('https://bm.wikipedia.org/')),
            'https://bm.wikipedia.org/-/mw/jsConfigVars.js',
            'Full Url for relative path with skipping one file');

    t.equal(getFullUrl('../-/mw/jsConfigVars.js', 'https://bm.wikipedia.org/'),
            'https://bm.wikipedia.org/-/mw/jsConfigVars.js',
            'Full Url for relative path with skipping one folder');

    t.equal(getFullUrl('https://wikimedia.org/api/rest_v1/media/math/render/svg/34cbb1e27dae0c04fc794a91f2aa001aca7054c1', 'https://en.wikipedia.org/'),
            'https://wikimedia.org/api/rest_v1/media/math/render/svg/34cbb1e27dae0c04fc794a91f2aa001aca7054c1',
            'Full Url when base and url both strtas with http/s');
})

test('Custom flavour path', async(t) => {

    // checks in current working directory.
    const tmpObj = tmp.fileSync({ postfix: '.js' });
    process.chdir(pathParser.resolve(tmpObj.name,'../'));

    t.equal(sanitize_customFlavour(tmpObj.name), pathParser.resolve(process.cwd(), tmpObj.name),
        'Custom flavour in working directory.');

    // checks in extension directory.
    t.equal(sanitize_customFlavour('wiktionary_fr.js'), pathParser.resolve(__dirname, '../../extensions/wiktionary_fr.js'),
        'Custom flavour in extensions directory.');

    t.equal(sanitize_customFlavour('wiktionary_fr'), pathParser.resolve(__dirname, '../../extensions/wiktionary_fr.js'),
        'Custom flavour in extension directory without js extension.');

    // checks in absolute path.
    t.equal(sanitize_customFlavour(pathParser.resolve(__dirname, '../../extensions/wiktionary_fr.js')),
        pathParser.resolve(__dirname, '../../extensions/wiktionary_fr.js'),
        'Positive check with absolute path.');

    t.equal(sanitize_customFlavour(pathParser.resolve(__dirname, '../../extensions/negativeTest.js')),
        null, 'Negative test for absolute path.');

    // negative scenario
    t.equal(sanitize_customFlavour('wrongCustomFlavour.js'), null, 'Returning null when file doesnt exist.')
})

test('getMediaBase tests', async(t) => {

    // Thumbs
    t.equal(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Westminstpalace.jpg/220px-Westminstpalace.jpg', true), 'Westminstpalace.jpg', 'Thumb 1');
    t.equal(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/3/39/Westminstpalace.jpg', true), 'Westminstpalace.jpg', 'No thumb');
    t.equal(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/0/0d/VFPt_Solenoid_correct2.svg', true), 'VFPt_Solenoid_correct2.svg', 'SVG');
    t.equal(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/VFPt_Solenoid_correct2.svg/120px-VFPt_Solenoid_correct2.svg.png', true), 'VFPt_Solenoid_correct2.svg.png', 'SVG PNG thumb');
    t.equal(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/120px--S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.jpg', true), 'S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.jpg', 'Video poster');
    t.equal(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/c/c6/De-Z%C3%BCrich.ogg', false), 'De-Zürich.ogg', 'Escaped URL');
    t.equal(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/US_Navy_070406-N-2959L-756_Members_of_USS_Ronald_Reagan_%28CVN_76%29_First_Class_Association_prepare_and_put_toppings_on_pizzas_in_the_galley_as_part_of_a_special_dinner_prepared_for_the_crew.jpg/169px-thumbnail.jpg', true), 'US_Navy_070406-N-2959L-756_Members_of_USS_Ronald_Reagan_(CVN_76)_First_Class_Association_prepare_and_put_toppings_on_pizzas_in_the_galley_as_part_of_a_special_dinner_prepared_for_the_crew.jpg', 'Long thumb');
    t.equal(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/US_Navy_070406-N-2959L-756_Members_of_USS_Ronald_Reagan_%28CVN_76%29_First_Class_Association_prepare_and_put_toppings_on_pizzas_in_the_galley_as_part_of_a_special_dinner_prepared_for_the_crew.svg/169px-thumbnail.svg.png', true), 'US_Navy_070406-N-2959L-756_Members_of_USS_Ronald_Reagan_(CVN_76)_First_Class_Association_prepare_and_put_toppings_on_pizzas_in_the_galley_as_part_of_a_special_dinner_prepared_for_the_crew.svg.png', 'Long thumb with SVG PNG');

    // Latex (equations)
    t.equal(getMediaBase('https://wikimedia.org/api/rest_v1/media/math/render/svg/da47d67ac8dcb0be8b68d7bfdc676d9ce9bf1606', true), 'da47d67ac8dcb0be8b68d7bfdc676d9ce9bf1606.svg', 'Latex');

    // WikiHiero (hieroglyphs)
    t.equal(getMediaBase('https://en.wikipedia.org/w/extensions/wikihiero/img/hiero_G1.png?4d556', false), 'hiero_G1.png', 'WikiHiero png with URL args');
    t.equal(getMediaBase('https://en.wikipedia.org/w/extensions/wikihiero/img/hiero_G1.png', false), 'hiero_G1.png', 'WikiHiero png without URL args');

    // Score - is default behaviour
    t.equal(getMediaBase('https://upload.wikimedia.org/score/6/c/6clze8fxoo65795idk91426rskovmgp/6clze8fx.png', false), '012a83318ce8d3a438dbed3127b9e339.png', 'Score 1');

    // Graphoid (charts) - is default behaviour
    t.equal(getMediaBase('https://en.wikipedia.org/api/rest_v1/page/graph/png/COVID-19_pandemic_in_the_United_Kingdom/0/28fe8c45f73e8cc60d45086655340f49cdfd37d0.png', true), '43ffd82a8ffc4755312c22950fde7ac5.png', 'Graphoid');

    // Default behaviour
    t.equal(getMediaBase('https://maps.wikimedia.org/img/osm-intl,9,52.2789,8.0431,300x300.png?lang=ar&amp;domain=ar.wikipedia.org&amp;title=%D8%A3%D9%88%D8%B3%D9%86%D8%A7%D8%A8%D8%B1%D9%88%D9%83&amp;groups=_0a30d0118ec7c477895dffb596ad2b875958c8fe', true), '589fd4e3821c15d4fcebcedf2effd5b0.png', 'Default handling');
})

test('No title normalisation', async(t) => {
   const resp = await axios.get<MwApiResponse>('https://en.wiktionary.org/w/api.php?action=query&format=json&prop=redirects|revisions|pageimages&rdlimit=max&rdnamespace=0&redirects=true&titles=constructor', { responseType: 'json', });
   const normalizedObject = normalizeMwResponse(resp.data.query);
   t.equal(Object.keys(normalizedObject)[0], 'constructor', 'normalizeMwResponse returns title constructor');
})