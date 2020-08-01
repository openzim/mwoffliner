import pmap from 'p-map';
import MediaWiki from '../MediaWiki';
import Downloader from '../Downloader';
import { redirectsXId, articleDetailXId } from '../stores';
import { getArticlesByIds, getArticlesByNS } from './mw-api';


export async function getArticleIds(downloader: Downloader, mw: MediaWiki, mainPage?: string, articleIds?: string[]) {
    if (mainPage) {
        await getArticlesByIds([mainPage], downloader);
    }

    if (articleIds) {
        await getArticlesByIds(articleIds, downloader);
        // Sometimes the articleList will contain redirects, we need to de-dup them here
        await trimRedirectedArticles(downloader);
    } else {
        await pmap(
            mw.namespacesToMirror,
            (namespace: string) => {
                return getArticlesByNS(mw.namespaces[namespace].num, downloader);
            },
            {concurrency: downloader.speed}
        );
    }
}

async function trimRedirectedArticles(downloader: Downloader) {
    return redirectsXId.iterateItems(downloader.speed, async (redirectId) => {
        // todo skip await?
        await articleDetailXId.delete(redirectId);
    });
}
