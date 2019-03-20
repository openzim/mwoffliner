import Downloader from '../Downloader';
import { AsyncCargo } from 'async';
import logger from '../Logger';
import { mapLimit } from '.';
import Redis from '../redis';
import MediaWiki from '../MediaWiki';
import { articleDetailXId } from '../articleDetail';
import { queryMw } from 'mw-query';

export async function getArticleIds(downloader: Downloader, redis: Redis, mw: MediaWiki, mainPage?: string, articleIds?: string[]) {
    let out;
    if (articleIds) {
        out = getInfoForArticleIds(articleIds, mw);
    } else {
        const namespaceVals = await getInfoForNamespaces(downloader, mw);
        out = namespaceVals
            .reduce((acc, val) => {
                const reWrittenIds = Object.entries(val)
                    .reduce((acc, [key, value]) => {
                        const newKey = key.replace(/ /g, '_');
                        return {
                            ...acc,
                            [newKey]: value,
                        };
                    }, {});
                Object.assign(
                    acc,
                    reWrittenIds,
                );
                return acc;
            }, {});
    }

    if (mainPage) {
        Object.assign(
            out,
            getInfoForArticleIds([mainPage], mw),
        );
    }
    return out;
}

/* Get ids from file */
async function getInfoForArticleIds(articleIds: string[], mw: MediaWiki) {
    return queryMw({
        apiUrl: mw.apiUrl.replace('?', ''),
    },
        {
            categories: { cllimit: 'max' },
            redirects: { rdlimit: 'max' },
            coordinates: {},
            revisions: {},
        },
        articleIds,
    );
}

/* Get ids from Mediawiki API */
async function getArticleIdsForNamespace(downloader: Downloader, mw: MediaWiki, namespace: string) {

    return queryMw({
        apiUrl: mw.apiUrl.replace('?', ''),
    },
        {
            categories: { cllimit: 'max' },
            coordinates: { colimit: 'max' },
            revisions: {},
            _opts: {
                generator: 'allpages',
                gapfilterredir: 'nonredirects',
                gaplimit: 'max',
                gapnamespace: String(mw.namespaces[namespace].num),
                rawcontinue: 'true',
            },
        },
    );

}

function getInfoForNamespaces(downloader: Downloader, mw: MediaWiki) {
    return mapLimit(
        mw.namespacesToMirror,
        downloader.speed,
        (namespace: string) => getArticleIdsForNamespace(downloader, mw, namespace),
    );
}
