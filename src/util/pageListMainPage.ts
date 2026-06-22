import { Dump } from '../Dump.js'
import { encodePageTitleForZimHtmlUrl } from './index.js'

export function makePageListItem(dump: Dump, page: PageDetail) {
  return `<li><a href="${encodePageTitleForZimHtmlUrl(page.title)}">${page.title || ''}<a></li>\n`
}

export function makePageImageTile(dump: Dump, page: PageDetail) {
  return `<a class="item" href="${encodePageTitleForZimHtmlUrl(page.title)}">
            <figure><img loading="lazy" src="${page.internalThumbnailUrl}" />
            <figcaption>${page.title || ''}</figcaption></figure></a>\n`
}
