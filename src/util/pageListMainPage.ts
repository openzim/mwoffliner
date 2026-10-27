import { Dump } from '../Dump.js'
import { encodePageTitleForZimHtmlUrl } from './index.js'

// Tiles keep the shape of their thumbnail within 1:2 to 2:1. Beyond that the tile takes the
// clamped shape and the image is cropped to it, so a very tall or very wide image cannot
// distort a row of the welcome page, and its crop does not depend on where it lands.
const MIN_TILE_RATIO = 1 / 2
const MAX_TILE_RATIO = 2
const DEFAULT_TILE_RATIO = 4 / 3

export function makePageListItem(dump: Dump, page: PageDetail) {
  return `<li><a href="${encodePageTitleForZimHtmlUrl(page.title)}">${page.title || ''}<a></li>\n`
}

/** Width / height of the welcome page tile, clamped and rounded to 4 decimals */
export function getPageImageTileRatio(page: PageDetail): number {
  const { width, height } = page.thumbnail || {}
  const ratio = width > 0 && height > 0 ? width / height : DEFAULT_TILE_RATIO
  return Math.round(Math.min(MAX_TILE_RATIO, Math.max(MIN_TILE_RATIO, ratio)) * 10000) / 10000
}

export function makePageImageTile(dump: Dump, page: PageDetail) {
  return `<a class="item" href="${encodePageTitleForZimHtmlUrl(page.title)}" style="--r:${getPageImageTileRatio(page)}">
            <figure><img loading="lazy" src="${page.internalThumbnailUrl}" alt="" />
            <figcaption>${page.title || ''}</figcaption></figure></a>\n`
}
