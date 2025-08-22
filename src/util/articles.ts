import MediaWiki from '../MediaWiki.js'
import Downloader from '../Downloader.js'
import * as domino from 'domino'

/**
 * Check if a given article title or id is main page of the target ZIM
 */
export function isMainPage(articleTitleOrId: string): boolean {
  return MediaWiki.metaData.mainPage === articleTitleOrId || MediaWiki.metaData.mainPage === articleTitleOrId.replace(/ /g, '_')
}

/**
 * Check if a given article title or id is a subpage or not
 *
 * A given is a subpage if subpages are activated on its namespace and it contains a / in its title/id
 */
export function isSubpage(articleTitleOrId: string) {
  if (articleTitleOrId && articleTitleOrId.indexOf('/') >= 0) {
    if (articleTitleOrId.indexOf(':') < 0) {
      // namespace 0 never allows subpages
      return false
    }
    const namespace = articleTitleOrId.substring(0, articleTitleOrId.indexOf(':'))
    const ns = MediaWiki.namespaces[namespace]
    if (ns !== undefined) {
      return ns.allowedSubpages
    }
  }
  return false
}

/**
 * For a given namespace number, get the namespace name
 */
export function getNamespaceName(namespace: number) {
  return Object.entries(MediaWiki.namespaces).find(([, data]) => data.num === namespace)?.[0]
}

/**
 * Extract the JS config variables from its headHtml, typically returned by MW API call when fetching article content
 */
export function extractJsConfigVars(headHtml: string, extraJsConfigVars) {
  const jsConfigVars = JSON.parse(headHtml.match(/;RLCONF=({".*?});\s?RLSTATE=/)[1])
  delete jsConfigVars.wgRequestId
  delete jsConfigVars.wgUserId
  delete jsConfigVars.wgUserIsTemp
  delete jsConfigVars.wgUserEditCount
  delete jsConfigVars.wgUserRegistration
  delete jsConfigVars.wgUserFirstRegistration
  return Object.assign(jsConfigVars, extraJsConfigVars, {
    wgBreakFrames: false,
    wgUserName: null,
    wgUserGroups: ['*'],
    wgIsProbablyEditable: false,
    wgRelevantPageIsProbablyEditable: false,
  })
}

/**
 * Extract the CSS class to apply on article <body> tag from its headHtml, typically returned by MW API call when fetching article content
 */
export function extractBodyCssClass(headHtml: string): string {
  const document = domino.createDocument(headHtml)
  let cssClass = document.body.className
  // drop some known classes which do not makes sense in a ZIM
  for (const blacklistedClass of ['mw-editable']) {
    cssClass = cssClass.replace(blacklistedClass, '')
  }
  // drop repetitions of two spaces
  return cssClass
    .split(' ')
    .filter((cssClass) => cssClass)
    .join(' ')
}

/**
 * Extract the CSS class to apply on article <html> tag from its headHtml, typically returned by MW API call when fetching article content
 */
export function extractHtmlCssClass(headHtml: string): string {
  const document = domino.createDocument(headHtml)
  const cssClass = document.documentElement.className
  // drop some known classes which do not makes sense in a ZIM
  /* for (const blacklistedClass of []) {
    cssClass = cssClass.replace(blacklistedClass, '')
  } */
  // drop repetitions of two spaces
  return cssClass
    .split(' ')
    .filter((cssClass) => cssClass)
    .join(' ')
}

/**
 * Get the special display title for the main page
 */
export async function getMainpageTitle(): Promise<string> {
  const checkUrl = Downloader.apiUrlDirector.buildQueryURL({
    action: 'query',
    meta: 'allmessages',
    ammessages: 'mainpage-title',
    amenableparser: '1',
    format: 'json',
    formatversion: '2',
  })
  let data: any
  try {
    data = await Downloader.getJSON<any>(checkUrl)
    const message = data.query.allmessages[0]
    if (!message || message.missing) {
      return '-'
    }
    return message.content
  } catch {
    return '-'
  }
}
