import Downloader from '../Downloader';
import { mapLimit } from '.';
import Redis from '../redis';
import MediaWiki from '../MediaWiki';
import { getArticlesByIds, getArticlesByNS } from './mw-api';

export async function getArticleIds(downloader: Downloader, redis: Redis, mw: MediaWiki, mainPage?: string, articleIds?: string[]) {
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

    if (mainPage) {
        await getArticlesByIds([mainPage], downloader);
    }

}
