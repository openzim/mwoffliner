import { Dump } from '../Dump.js';
import {
  encodeArticleIdForZimHtmlUrl,
  isWebpCandidateImageMimeType,
  getMimeType,
} from '../util/index.js';

export function makeArticleListItem(dump: Dump, articleEntry: ArticleDetail) {
  return `<li><a href="${encodeArticleIdForZimHtmlUrl(articleEntry.title.replace(/ /g, '_'))}">${articleEntry.title.replace(/_/g, ' ') || ''}<a></li>\n`
}

export function makeArticleImageTile(dump: Dump, articleEntry: ArticleDetail, webp: boolean) {
    return `<a class="item" href="${encodeArticleIdForZimHtmlUrl(articleEntry.title.replace(/ /g, '_'))}">
            <figure><img loading="lazy" src="${articleEntry.internalThumbnailUrl +
            (isWebpCandidateImageMimeType(webp, getMimeType(articleEntry.internalThumbnailUrl)) ? '.webp' : '')}" />
            <figcaption>${(articleEntry.title || '').replace(/_/g, ' ')}</figcaption></figure></a>\n`;
}
