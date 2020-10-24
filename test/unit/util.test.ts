import './bootstrap.test';
import test from 'blue-tape';
import { URL } from 'url';
import fs from 'fs';
import pathParser from 'path';
import { encodeArticleIdForZimHtmlUrl, interpolateTranslationString, getFullUrl, getCustomFlavorPath } from 'src/util';
import { testHtmlRewritingE2e } from 'test/util';

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
    let createStream = fs.createWriteStream(pathParser.resolve(process.cwd(), 'testCustomFlavour.js'));

    t.equal(getCustomFlavorPath('testCustomFlavour.js'), pathParser.resolve(process.cwd(), 'testCustomFlavour.js'),
        'Custom flavour in working directory.');

    // checks when current and working directory have file with same name(preference to working directory).
    createStream = fs.createWriteStream(pathParser.resolve(process.cwd(), 'extensions/testCustomFlavour.js'));

    t.equal(getCustomFlavorPath('testCustomFlavour'), pathParser.resolve(process.cwd(), 'testCustomFlavour.js'),
        'When file with same name exist in extensions directory.');

    createStream.end();
    fs.unlinkSync(pathParser.resolve(process.cwd(), 'testCustomFlavour.js'));
    fs.unlinkSync(pathParser.resolve(process.cwd(), 'extensions/testCustomFlavour.js'));

    // checks in extension directory.
    t.equal(getCustomFlavorPath('wiktionary_fr.js'), pathParser.resolve(process.cwd(), 'extensions/wiktionary_fr.js'),
        'Custom flavour in extensions directory.');

    t.equal(getCustomFlavorPath('wiktionary_fr'), pathParser.resolve(process.cwd(), 'extensions/wiktionary_fr.js'),
        'Custom flavour in extension directory without js extension.');

    // checks in absolute path.
    createStream = fs.createWriteStream(pathParser.resolve(process.cwd(), 'extensions/testCustomFlavour.js'));

    t.equal(getCustomFlavorPath(pathParser.resolve(process.cwd(), 'extensions/testCustomFlavour.js')),
        pathParser.resolve(process.cwd(), 'extensions/testCustomFlavour.js'),
        'Positive check with absolute path.');

    t.equal(getCustomFlavorPath(pathParser.resolve(process.cwd(), 'extensions/negativeTest.js')),
        null, 'Negative test for absolute path.');

    createStream.end();
    fs.unlinkSync(pathParser.resolve(process.cwd(), 'extensions/testCustomFlavour.js'));

    // negative scenario
    t.equal(getCustomFlavorPath('wrongCustomFlavour.js'), null, 'Returning null when file doesnt exist.')
})
