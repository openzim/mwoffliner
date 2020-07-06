import './bootstrap.test';
import test from 'blue-tape';
import { encodeArticleIdForZimHtmlUrl, interpolateTranslationString, mutateToFullUrl } from 'src/util';
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

test('mutate to full URL', async(t) => {
    const currentFolder = process.cwd();
    const styleUrl = mutateToFullUrl('/w/load.php?lang=bm&modules=site.styles&only=styles&skin=vector', 'https://bm.wikipedia.org/');
    t.equal(styleUrl, 'https://bm.wikipedia.org/w/load.php?lang=bm&modules=site.styles&only=styles&skin=vector', 'Full URL for styles');

    const imageUrl = mutateToFullUrl('/w/resources/src/mediawiki.skinning/images/spinner.gif?ca65b', 'https://bm.wikipedia.org/w/load.php?lang=bm&modules=ext.uls.interlanguage%7Cext.visualEditor.desktopArticleTarget.noscript%7Cext.wikimediaBadges%7Cskins.vector.styles.legacy%7Cwikibase.client.init&only=styles&skin=vector');
    t.equal(imageUrl, 'https://bm.wikipedia.org/w/resources/src/mediawiki.skinning/images/spinner.gif?ca65b', 'Full URL for image');

    const relativeUrl = mutateToFullUrl('./-/j/js_modules/jsConfigVars.js', 'https://bm.wikipedia.org');
    t.equal(relativeUrl, `https://bm.wikipedia.org${currentFolder}/-/j/js_modules/jsConfigVars.js`, 'Full Url for relative path with skipping one file');

    const relativeUrlWithFolder = mutateToFullUrl('../-/j/js_modules/jsConfigVars.js', 'https://bm.wikipedia.org');
    const folderSplit = currentFolder.split('/');
    t.equal(relativeUrlWithFolder, `https://bm.wikipedia.org${folderSplit.slice(0, folderSplit.length-1).join('/')}/-/j/js_modules/jsConfigVars.js`, 'Full Url for relative path with skipping one folder');

    const httpUrl = mutateToFullUrl('https://wikimedia.org/api/rest_v1/media/math/render/svg/34cbb1e27dae0c04fc794a91f2aa001aca7054c1', 'https://en.wikipedia.org/');
    t.equal(httpUrl, 'https://wikimedia.org/api/rest_v1/media/math/render/svg/34cbb1e27dae0c04fc794a91f2aa001aca7054c1', 'Full Url when base and url both strtas with http/s');
})
