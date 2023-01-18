import pmap from 'p-map'
import MediaWiki from '../MediaWiki.js'
import Downloader from '../Downloader.js'
import { getArticlesByIds, getArticlesByNS } from './mw-api.js'

export async function getArticleIds(downloader: Downloader, mw: MediaWiki, mainPage?: string, articleIds?: string[], articleIdsToIgnore?: string[]) {
  if (mainPage) {
    await getArticlesByIds([mainPage], downloader)
  }

  if (articleIds) {
    await getArticlesByIds(articleIds, downloader)
  } else {
    await pmap(
      mw.namespacesToMirror,
      (namespace: string) => {
        return getArticlesByNS(mw.namespaces[namespace].num, downloader, articleIdsToIgnore)
      },
      { concurrency: downloader.speed },
    )
  }
}
