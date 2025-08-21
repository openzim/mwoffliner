import { migrateChildren, getMediaBase, getFullUrl, getRelativeFilePath, encodeArticleIdForZimHtmlUrl } from './misc.js'
import { Dump } from '../Dump.js'
import MediaWiki from '../MediaWiki.js'
import RedisStore from '../RedisStore.js'
import DU from '../DOMUtils.js'
import * as logger from '../Logger.js'

function rewriteUrlNoArticleCheck(articleId: string, dump: Dump, linkNode: DominoElement, mediaDependencies?: string[]): string {
  const classList: string[] = (linkNode.getAttribute('class') || '').split(' ').filter((cssClass) => cssClass)
  const rel: string[] = (linkNode.getAttribute('rel') || '').split(' ').filter((rel) => rel)
  let href = linkNode.getAttribute('href') || ''
  let hrefProtocol

  // Always keep selflinks
  if (classList.includes('mw-selflink') && !href) {
    return null
  }
  // Always remove redlinks
  if (classList.includes('new')) {
    migrateChildren(linkNode, linkNode.parentNode, linkNode)
    linkNode.parentNode.removeChild(linkNode)
    return null
  }

  const extractScheme = function (href: string) {
    const match = href.match(/^([a-zA-Z][a-zA-Z\d+\-.]*):/)
    return match ? match[1] : null
  }

  try {
    hrefProtocol = extractScheme(href)
  } catch {
    return null
  }
  if (hrefProtocol && !hrefProtocol.includes('http')) {
    // e.g. geo:11111,11111
    return null
  }
  if (rel.includes('mwo:NoRewrite')) {
    return null
  }
  if (!hrefProtocol && href.slice(0, 2) === '//') {
    href = `${MediaWiki.webUrl.protocol}${href}`
    linkNode.setAttribute('href', href)
    hrefProtocol = MediaWiki.webUrl.protocol
  }
  if (!rel.length && linkNode.getAttribute('resource')) {
    rel.push('mw:MediaLink')
  }
  if (hrefProtocol && hrefProtocol.includes('http') && !rel.length) {
    rel.push('mw:ExtLink')
  }
  if (!href) {
    DU.deleteNode(linkNode)
    return null
  }
  if (href.substring(0, 1) === '#') {
    return null
  }

  /* Deal with custom geo. URL replacement, for example:
   * http://maps.wikivoyage-ev.org/w/poimap2.php?lat=44.5044943&lon=34.1969633&zoom=15&layer=M&lang=ru&name=%D0%9C%D0%B0%D1%81%D1%81%D0%B0%D0%BD%D0%B4%D1%80%D0%B0
   * http://tools.wmflabs.org/geohack/geohack.php?language=fr&pagename=Tour_Eiffel&params=48.85825_N_2.2945_E_type:landmark_region:fr
   */
  if (!rel.includes('mw:WikiLink')) {
    let lat
    let lon
    if (/poimap2\.php/i.test(href)) {
      const hrefQuery = new URL(href, MediaWiki.baseUrl)
      lat = parseFloat(hrefQuery.searchParams.get('lat') as string)
      lon = parseFloat(hrefQuery.searchParams.get('lon') as string)
    } else if (/geohack\.php/i.test(href)) {
      const params = new URL(href, MediaWiki.baseUrl).searchParams.get('params')

      if (params) {
        // see https://bitbucket.org/magnusmanske/geohack/src/public_html/geo_param.php
        const pieces = params.toUpperCase().split('_')
        const semiPieces = pieces.length > 0 ? pieces[0].split(';') : undefined
        if (semiPieces && semiPieces.length === 2) {
          ;[lat, lon] = semiPieces
        } else {
          const factors = [1, 60, 3600]
          let offs = 0

          const deg = (hemiHash: any) => {
            let out = 0
            let hemiSign = 0
            for (let i = 0; i < 4 && i + offs < pieces.length; i += 1) {
              const v = pieces[i + offs]
              hemiSign = hemiHash[v]
              if (hemiSign) {
                offs = i + 1
                break
              }
              out += +v / factors[i]
            }
            return out * hemiSign
          }
          lat = deg({ N: 1, S: -1 })
          lon = deg({ E: 1, W: -1, O: 1 })
        }
      }
    } else if (/Special:Map/i.test(href)) {
      const parts = href.split('/')
      lat = parts[4]
      lon = parts[5]
    } else if (rel.includes('mw:MediaLink') || classList.includes('internal')) {
      const shouldScrape = (href.includes('.pdf') && !dump.nopdf) || ((href.includes('.ogg') || href.includes('.oga')) && !dump.nopic && !dump.novid && !dump.nodet)

      if (shouldScrape) {
        try {
          const newHref = getRelativeFilePath(articleId, getMediaBase(href, true))
          linkNode.setAttribute('href', newHref)
          if (mediaDependencies) {
            mediaDependencies.push(href)
          }
        } catch (err) {
          logger.warn('Error parsing url:', err)
          DU.deleteNode(linkNode)
        }
      } else {
        linkNode.outerHTML = linkNode.innerHTML
      }
      return null
    }

    if (!isNaN(lat) && !isNaN(lon)) {
      href = `geo:${lat},${lon}`
      linkNode.setAttribute('href', href)
      return null
    }
  }

  if (!(href.startsWith(MediaWiki.webUrl.href) && !classList.includes('external')) && !classList.includes('mirror-link')) {
    /* Add 'external' class to interwiki links */
    if (!classList.includes('external') && (rel.includes('mw:ExtLink') || rel.includes('mw:WikiLink/Interwiki') || classList.includes('extiw'))) {
      DU.appendToAttr(linkNode, 'class', 'external')
      classList.push('external')
    }
    /* Rewrite external links starting with // */
    if (classList.includes('external') || rel.includes('nofollow')) {
      if (href.substring(0, 1) === '/') {
        linkNode.setAttribute('href', getFullUrl(href, MediaWiki.baseUrl))
      } else if (href.substring(0, 2) === './') {
        migrateChildren(linkNode, linkNode.parentNode, linkNode)
        linkNode.parentNode.removeChild(linkNode)
      }
      return null
    }
    if (rel.length && !rel.includes('mw:WikiLink') && !rel.includes('mw:referencedBy')) {
      return null
    }
  }

  const title = MediaWiki.extractPageTitleFromHref(href)
  if (title) {
    const localAnchor = href.lastIndexOf('#') === -1 ? '' : href.substr(href.lastIndexOf('#'))
    linkNode.setAttribute('href', encodeArticleIdForZimHtmlUrl(title) + localAnchor)
    return title
  }

  // Rewrite any urls still remaining
  DU.appendToAttr(linkNode, 'class', 'external')
  linkNode.setAttribute('href', getFullUrl(href, MediaWiki.baseUrl))
  return null
}

async function checkIfArticlesMirrored(articleTitles: string[], articleDetailXId: RKVS<ArticleDetail>): Promise<[string[], string[]]> {
  const mirrored: string[] = []
  const unmirrored: string[] = []
  if (!articleTitles.length) {
    return [mirrored, unmirrored]
  }

  const articlesMirrored = await articleDetailXId.existsMany(articleTitles)
  for (const articleTitle of articleTitles) {
    if (articlesMirrored[articleTitle]) {
      mirrored.push(articleTitle)
    } else {
      unmirrored.push(articleTitle)
    }
  }
  return [mirrored, unmirrored]
}

async function rewriteUrls(articleId: string, dump: Dump, linkNodes: DominoElement[]): Promise<{ mediaDependencies: string[] }> {
  const mediaDependencies: string[] = []

  /*
   * key: article title
   * value: Array of linkNodes linking to article
   */
  const wikilinkMappings: { [title: string]: DominoElement[] } = {}

  for (const linkNode of linkNodes) {
    const articleLink = rewriteUrlNoArticleCheck(articleId, dump, linkNode, mediaDependencies)

    if (articleLink) {
      if (Array.isArray(wikilinkMappings[articleLink])) {
        wikilinkMappings[articleLink].push(linkNode)
      } else {
        wikilinkMappings[articleLink] = [linkNode]
      }
    }
  }

  const [, unmirroredTitles] = await checkIfArticlesMirrored(Object.keys(wikilinkMappings), RedisStore.articleDetailXId)

  if (unmirroredTitles.length) {
    const articlesRedirected = await RedisStore.redirectsXId.existsMany(unmirroredTitles)
    for (const articleTitle of unmirroredTitles) {
      const redirect = articlesRedirected[articleTitle]
      if (!redirect) {
        wikilinkMappings[articleTitle].forEach((linkNode: DominoElement) => {
          migrateChildren(linkNode, linkNode.parentNode, linkNode)
          linkNode.parentNode.removeChild(linkNode)
        })
        delete wikilinkMappings[articleTitle]
      }
    }
  }

  if (articleId.includes('/')) {
    const slashesInUrl = articleId.split('/').length - 1
    const upStr = slashesInUrl ? '../'.repeat(slashesInUrl) : './'
    Object.values(wikilinkMappings).forEach((linkNodes: DominoElement[]) => {
      for (const linkNode of linkNodes) {
        const href = linkNode.getAttribute('href')
        linkNode.setAttribute('href', `${upStr}${href}`)
      }
    })
  }

  return { mediaDependencies }
}

export function rewriteUrl(articleId: string, dump: Dump, linkNode: DominoElement): Promise<{ mediaDependencies: string[] }> {
  return rewriteUrls(articleId, dump, [linkNode])
}

export async function rewriteUrlsOfDoc(parsoidDoc: DominoElement, articleId: string, dump: Dump): Promise<{ mediaDependencies: string[]; doc: DominoElement }> {
  /* Go through all links */
  const as = parsoidDoc.getElementsByTagName('a')
  const areas = parsoidDoc.getElementsByTagName('area')
  const linkNodes: DominoElement[] = Array.prototype.slice.call(as).concat(Array.prototype.slice.call(areas))

  const ret = await rewriteUrls(articleId, dump, linkNodes)
  return {
    ...ret,
    doc: parsoidDoc,
  }
}
