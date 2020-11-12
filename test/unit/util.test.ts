import './bootstrap.test';
import test from 'blue-tape';
import { URL } from 'url';
import tmp from 'tmp';
import pathParser from 'path';
import { sanitize_customFlavour } from 'src/sanitize-argument';
import { encodeArticleIdForZimHtmlUrl, interpolateTranslationString, getFullUrl } from 'src/util';
import { testHtmlRewritingE2e } from 'test/util';
import { getMediaBase } from '../../src/util/'
import logger from '../../src/Logger';
import { waitForDebugger } from 'inspector';

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
        undefined,                            undefined
    ];

    while (articles.length) {
        const unencoded = articles.shift();
        const   encoded = articles.shift();
        t.equal(encoded, encodeArticleIdForZimHtmlUrl(unencoded), `encodeArticleIdForZimHtmlUrl() encoding`);
    }
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

    t.equal(getFullUrl('./-/j/js_modules/jsConfigVars.js', new URL('https://bm.wikipedia.org/')),
            'https://bm.wikipedia.org/-/j/js_modules/jsConfigVars.js',
            'Full Url for relative path with skipping one file');

    t.equal(getFullUrl('../-/j/js_modules/jsConfigVars.js', 'https://bm.wikipedia.org/'),
            'https://bm.wikipedia.org/-/j/js_modules/jsConfigVars.js',
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
    t.equal(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Westminstpalace.jpg/220px-Westminstpalace.jpg', true), 'm/Westminstpalace.jpg', 'Thumb 1');
    t.equal(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Westminstpalace.jpg/110px-Westminstpalace.jpg', true), 'm/Westminstpalace.jpg', 'Thumb 2');
    t.equal(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/3/39/Westminstpalace.jpg', true), 'm/Westminstpalace.jpg', 'No thumb');
    t.equal(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/0/0d/VFPt_Solenoid_correct2.svg', true), 'm/VFPt_Solenoid_correct2.svg', 'SVG');
    t.equal(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/VFPt_Solenoid_correct2.svg/120px-VFPt_Solenoid_correct2.svg.png', true), 'm/VFPt_Solenoid_correct2.svg.png', 'SVG PNG thumb');
    t.equal(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/120px--S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.jpg', true), 'm/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.jpg', 'Video poster');
    t.equal(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/c/c6/De-Z%C3%BCrich.ogg', false), 'm/De-Zürich.ogg', 'Escaped URL');

    // Latex (equations)
    t.equal(getMediaBase('https://wikimedia.org/api/rest_v1/media/math/render/svg/da47d67ac8dcb0be8b68d7bfdc676d9ce9bf1606', true), 'm/da47d67ac8dcb0be8b68d7bfdc676d9ce9bf1606.svg', 'Latex');
})