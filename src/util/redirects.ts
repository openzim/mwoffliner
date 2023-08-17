import pmap from 'p-map'
import MediaWiki from '../MediaWiki.js'
import Downloader from '../Downloader.js'
import { getArticlesByIds, getArticlesByNS } from './mw-api.js'

export async function getArticleIds(downloader: Downloader, redisStore: RS, mainPage?: string, articleIds?: string[], articleIdsToIgnore?: string[]) {
  if (mainPage) {
    await getArticlesByIds([mainPage], downloader, redisStore)
  }

  if (articleIds) {
    await getArticlesByIds(articleIds, downloader, redisStore)
  } else {
    await pmap(
      MediaWiki.namespacesToMirror,
      (namespace: string) => {
        return getArticlesByNS(MediaWiki.namespaces[namespace].num, downloader, redisStore, articleIdsToIgnore)
      },
      { concurrency: downloader.speed },
    )
  }
}
