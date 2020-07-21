import './bootstrap.test';
import test from 'blue-tape';
import Downloader from 'src/Downloader';
import MediaWiki from 'src/MediaWiki';
import { getArticleIds } from 'src/util/redirects';
import { articleDetailXId } from 'src/stores';
import { getArticlesByNS } from 'src/util';

test('MWApi Article Ids', async (t) => {
    await articleDetailXId.flush();
    const mw = new MediaWiki({
        base: 'https://en.wikipedia.org',
        getCategories: true,
    } as any);

    const downloader = new Downloader({ mw, uaString: '', speed: 1, reqTimeout: 1000 * 60, noLocalParserFallback: false, forceLocalParser: false, optimisationCacheUrl: '' });

    await mw.getMwMetaData(downloader);
    await downloader.checkCapabilities();

    const aIds = ['London', 'United_Kingdom', 'Farnborough/Aldershot_Built-up_Area'];
    await getArticleIds(downloader, mw, 'Main_Page', aIds);
    const articlesById = await articleDetailXId.getMany(aIds);
    const { United_Kingdom, London } = articlesById;
    t.assert(!!United_Kingdom, 'Article "United_Kingdom" was scraped');
    t.assert(United_Kingdom.categories.length > 15, 'Article "United_Kingdom" has categories');
    // t.assert((United_Kingdom as any).pageimage, 'Article "United_Kingdom" has pageimage');
    t.assert(United_Kingdom.thumbnail, 'Article "United_Kingdom" has thumbnail');
    t.assert(!!United_Kingdom.revisionId, 'Article "United_Kingdom" has revision');

    t.assert(!!London, 'Article "London" was scraped');
    t.assert(!!London.coordinates, 'Article "London" has geo coords');

    t.assert(!!articlesById['Farnborough/Aldershot_Built-up_Area'], 'Complex article was scraped');
});

test('MWApi NS', async (t) => {
    await articleDetailXId.flush();
    const mw = new MediaWiki({
        base: 'https://en.wikipedia.org',
        getCategories: true,
    } as any);

    const downloader = new Downloader({ mw, uaString: '', speed: 1, reqTimeout: 1000 * 60, noLocalParserFallback: false, forceLocalParser: false, optimisationCacheUrl: '' });

    await mw.getMwMetaData(downloader);
    await downloader.checkCapabilities();

    await mw.getNamespaces([], downloader);

    await getArticlesByNS(0, downloader, 5); // Get 5 continues/pages of NSes
    const interestingAIds = ['"...And_Ladies_of_the_Club"', '"M"_Circle'];
    const articles = await articleDetailXId.getMany(interestingAIds);
    const Ladies = articles['"...And_Ladies_of_the_Club"'];
    const Circle = articles['"M"_Circle'];

    t.assert(!!Ladies, 'Article ""...And_Ladies_of_the_Club"" has been scraped');
    t.assert(!!Circle, 'Article ""M"_Circle" has been scraped');

    t.assert(Ladies.categories.length, 'Ladies article has categories');
    t.assert(!!Ladies.revisionId, 'Ladies article has revision');

    t.assert(!!Circle.coordinates, 'Circle article has coordinates');
    // t.assert((Circle as any).pageimage, 'Circle article has pageimage');
    // t.assert(Circle.thumbnail, 'Circle article has thumbnail');

    t.notEqual(Object.keys(mw.namespaces).length, 0, 'Got items in namespaces');
    let keysAreValid = true;
    Object.values(mw.namespaces).forEach((item) => {
        if (!Object.keys(item).includes('num') || !Object.keys(item).includes('allowedSubpages') || !Object.keys(item).includes('isContent')) keysAreValid = false;
    });
    t.true(keysAreValid, 'Namespaces have valid keys');

    test('extracting title from href', async(t) => {
        const titleWithWiki = mw.extractPageTitleFromHref('/wiki/Hades');
        t.equal(titleWithWiki, 'Hades', 'Title with hrefs contaning /wiki')
    
        const titleWithRelativePath = mw.extractPageTitleFromHref('./Damage_Formula');
        t.equal(titleWithRelativePath, 'Damage_Formula', 'Title with relative path')
    
        const titleWithDir= mw.extractPageTitleFromHref('../Agni');
        t.equal(titleWithDir, 'Agni', 'Title with dir path');

        const titleWithTwoDir= mw.extractPageTitleFromHref('../../Mali_Dung');
        t.equal(titleWithTwoDir, 'Mali_Dung', 'Title with two dir path');
    
        const titleWithAnchorJump = mw.extractPageTitleFromHref('./Subarns#Mali');
        t.equal(titleWithAnchorJump, 'Subarns', 'Title with Anchor Jump');

        const interWikiTitle = mw.extractPageTitleFromHref('Maldives');
        t.equal(interWikiTitle, null, 'Interwiki title')
    })
});
