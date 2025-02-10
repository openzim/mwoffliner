import { Dump } from '../Dump.js'
import { encodeArticleIdForZimHtmlUrl } from '../util/index.js'

export function makeArticleListItem(dump: Dump, articleEntry: ArticleDetail) {
  return `<li><a href="${encodeArticleIdForZimHtmlUrl(articleEntry.title.replace(/ /g, '_'))}">${articleEntry.title.replace(/_/g, ' ') || ''}<a></li>\n`
}

export function makeArticleImageTile(dump: Dump, articleEntry: ArticleDetail) {
  return `<a class="item" href="${encodeArticleIdForZimHtmlUrl(articleEntry.title.replace(/ /g, '_'))}">
            <figure><img loading="lazy" src="${articleEntry.internalThumbnailUrl}" />
            <figcaption>${(articleEntry.title || '').replace(/_/g, ' ')}</figcaption></figure></a>\n`
}
