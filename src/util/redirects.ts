import Downloader from '../Downloader';
import { mapLimit } from 'promiso';
import MediaWiki from '../MediaWiki';
import { getArticlesByIds, getArticlesByNS } from './mw-api';
import { redirectsXId, articleDetailXId } from '../stores';

export async function getArticleIds(downloader: Downloader, mw: MediaWiki, mainPage?: string, articleIds?: string[]) {
    if (mainPage) {
        await getArticlesByIds([mainPage], downloader);
    }

    if (articleIds) {
        await getArticlesByIds(articleIds, downloader);
        // Sometimes the articleList will contain redirects, we need to de-dup them here
        await trimRedirectedArticles(downloader);
    } else {
        await mapLimit(
            mw.namespacesToMirror,
            downloader.speed,
            (namespace: string) => {
                return getArticlesByNS(mw.namespaces[namespace].num, downloader);
            },
        );
    }
}

async function trimRedirectedArticles(downloader: Downloader) {
    return redirectsXId.iterateItems(downloader.speed, async (redirects) => {
        const redirectIds = Object.keys(redirects);
        await articleDetailXId.deleteMany(redirectIds);
    });
}
