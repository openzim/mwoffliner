import { migrateChildren, getMediaBase, getFullUrl, getRelativeFilePath, encodePageTitleForZimHtmlUrl } from './misc.js'
import { Dump } from '../Dump.js'
import MediaWiki from '../MediaWiki.js'
import RedisStore from '../RedisStore.js'
import DU from '../DOMUtils.js'
import * as logger from '../Logger.js'

function rewriteUrlNoContentCheck(pagePath: ZimPath, dump: Dump, linkNode: DominoElement, mediaDependencies?: string[]): PageTitle {
  const classList: string[] = (linkNode.getAttribute('class') || '').split(' ').filter((cssClass) => cssClass)
  const rel: string[] = (linkNode.getAttribute('rel') || '').split(' ').filter((rel) => rel)
  let href: string = linkNode.getAttribute('href') || ''
  let hrefProtocol

  // Exclude links already written appropriately
  if (classList.includes('mwo-norewrite')) {
    return null
  }

  // Always keep selflinks
  if (classList.includes('mw-selflink') && !href) {
    return null
  }
  // Always remove redlinks
  if (classList.includes('new')) {
    if (href.includes('title=Category:ThisCategoryDoesNotExists')) {
      // This is a full hack ; to be replaced with proper rewriting of redlink link
      // to page link + we also need to remove the 'new' class to remove redlink styling
      href = './Category:ThisCategoryDoesNotExists'
    } else {
      migrateChildren(linkNode, linkNode.parentNode, linkNode)
      linkNode.parentNode.removeChild(linkNode)
      return null
    }
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
          const mediaUrl = getFullUrl(href, MediaWiki.baseUrl)
          const newHref = getRelativeFilePath(pagePath, getMediaBase(mediaUrl, true))
          linkNode.setAttribute('href', newHref)
          if (mediaDependencies) {
            mediaDependencies.push(mediaUrl)
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
    linkNode.setAttribute('href', encodePageTitleForZimHtmlUrl(title) + localAnchor)
    return title
  }

  // Rewrite any urls still remaining
  DU.appendToAttr(linkNode, 'class', 'external')
  linkNode.setAttribute('href', getFullUrl(href, MediaWiki.baseUrl))
  return null
}

async function checkIfPagesMirrored(pageTitles: PageTitle[]): Promise<[string[], string[]]> {
  const mirrored: PageTitle[] = []
  const unmirrored: PageTitle[] = []
  if (!pageTitles.length) {
    return [mirrored, unmirrored]
  }

  const pagesMirrored = await RedisStore.pagesStore.existsMany(pageTitles)
  for (const pageTitle of pageTitles) {
    if (pagesMirrored[pageTitle]) {
      mirrored.push(pageTitle)
    } else {
      unmirrored.push(pageTitle)
    }
  }
  return [mirrored, unmirrored]
}

export async function rewriteUrls(pagePath: ZimPath, dump: Dump, linkNodes: DominoElement[]): Promise<{ mediaDependencies: string[] }> {
  const mediaDependencies: string[] = []

  /*
   * key: page title
   * value: Array of linkNodes linking to page
   */
  const wikilinkMappings: { [title: PageTitle]: DominoElement[] } = {}

  for (const linkNode of linkNodes) {
    const pageLink = rewriteUrlNoContentCheck(pagePath, dump, linkNode, mediaDependencies)

    if (pageLink) {
      if (Array.isArray(wikilinkMappings[pageLink])) {
        wikilinkMappings[pageLink].push(linkNode)
      } else {
        wikilinkMappings[pageLink] = [linkNode]
      }
    }
  }

  const [, unmirroredTitles] = await checkIfPagesMirrored(Object.keys(wikilinkMappings).map((l) => l as PageTitle))

  if (unmirroredTitles.length) {
    const pagesRedirected = await RedisStore.redirectsStore.existsMany(unmirroredTitles)
    for (const pageTitle of unmirroredTitles) {
      const redirect = pagesRedirected[pageTitle]
      if (!redirect) {
        wikilinkMappings[pageTitle].forEach((linkNode: DominoElement) => {
          migrateChildren(linkNode, linkNode.parentNode, linkNode)
          linkNode.parentNode.removeChild(linkNode)
        })
        delete wikilinkMappings[pageTitle]
      }
    }
  }

  if (pagePath.includes('/')) {
    Object.values(wikilinkMappings).forEach((linkNodes: DominoElement[]) => {
      for (const linkNode of linkNodes) {
        const href = linkNode.getAttribute('href')
        linkNode.setAttribute('href', getRelativeFilePath(pagePath, href))
      }
    })
  }

  return { mediaDependencies }
}

export async function rewriteUrlsOfDoc(parsoidDoc: DominoElement, pagePath: ZimPath, dump: Dump): Promise<{ mediaDependencies: string[]; doc: DominoElement }> {
  /* Go through all links */
  const as = parsoidDoc.getElementsByTagName('a')
  const areas = parsoidDoc.getElementsByTagName('area')
  const linkNodes: DominoElement[] = Array.prototype.slice.call(as).concat(Array.prototype.slice.call(areas))

  const ret = await rewriteUrls(pagePath, dump, linkNodes)
  return {
    ...ret,
    doc: parsoidDoc,
  }
}
