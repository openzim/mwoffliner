import './bootstrap.test';
import test from 'blue-tape';
import MediaWiki from 'src/MediaWiki';

test('media wiki', async (t) => {
    const mwDefaultWikiPath = new MediaWiki({
        base: 'https://bm.wikipedia.org//',
    } as any);

    const mwOtherWikiPath = new MediaWiki({
        base: 'https://gbf.wiki/',
        wikiPath: 'index.php',
    } as any);

    const otherWikiPathTitle = mwOtherWikiPath.extractPageTitleFromHref('/wiki/Damage_Formula');
    t.equals(otherWikiPathTitle, 'Damage_Formula', 'Correct Title returned for other internal wiki');

    const defaultWikiPathTitle = mwDefaultWikiPath.extractPageTitleFromHref('/wiki/Bagan');
    t.equals(defaultWikiPathTitle, null, 'Null returned for default internal wiki');
});
