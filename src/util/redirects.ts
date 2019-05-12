import Downloader from '../Downloader';
import { mapLimit } from 'promiso';
import MediaWiki from '../MediaWiki';
import { getArticlesByIds, getArticlesByNS } from './mw-api';

export async function getArticleIds(downloader: Downloader, mw: MediaWiki, mainPage?: string, articleIds?: string[]) {
    if (mainPage) {
        await getArticlesByIds([mainPage], downloader);
    }

    if (articleIds) {
        await getArticlesByIds(articleIds, downloader);
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
