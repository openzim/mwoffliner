import pmap from 'p-map'
import * as logger from '../Logger.js'
import Downloader from '../Downloader.js'
import Timer from './Timer.js'
import RedisStore from '../RedisStore.js'
import MediaWiki from '../MediaWiki.js'
import { cleanupAxiosError } from './misc.js'

const MAX_TITLES_PARAM_SIZE = 7400
const MAX_BATCH_SIZE = 50

export function trimPageTitlesBatch(pageTitles: PageTitle[]): PageTitle[] {
  const batch = pageTitles.slice(0, MAX_BATCH_SIZE)
  while (batch.length > 1 && new URLSearchParams({ titles: batch.join('|') }).toString().length > MAX_TITLES_PARAM_SIZE) {
    batch.pop()
  }
  return batch
}

export async function getPagesByTitle(
  pageTitles: PageTitle[],
  purpose: string,
  pagesToIgnore?: PageTitle[],
  allowedContentModels: string[] = ['wikitext'],
  categoryTitles: Set<PageTitle> = new Set(),
): Promise<void> {
  let from = 0
  let numThumbnails = 0

  // using async iterator to spawn workers
  await pmap(
    ','
      .repeat(Downloader.workers)
      .split(',')
      .map((_, i) => i),
    async (workerId: number) => {
      while (from < pageTitles.length) {
        const pageTitlesBatch = trimPageTitlesBatch(pageTitles.slice(from))

        const to = from + pageTitlesBatch.length
        const progressPercent = Math.floor((to / pageTitles.length) * 100)
        logger.info(`Worker [${workerId}] getting page range [${from}-${to}] of [${pageTitles.length}] for ${purpose} [${progressPercent}%]`)
        from = to

        // Nothing to do
        if (!pageTitlesBatch.length) {
          continue
        }

        // Retrieve the details and save them in Redis
        const allMwPages = await Downloader.getPagesByTitle(pageTitlesBatch, numThumbnails < 100)
        logger.info(`Received ${allMwPages.length} pages`)
        const { numThumbnails: iterThumbnails } = await processPagesAndSaveToRedis(allMwPages, pagesToIgnore, allowedContentModels, categoryTitles)
        numThumbnails += iterThumbnails
      }
    },
    { concurrency: Downloader.workers },
  )
}

export function filterPages(pages: QueryMwRet, pagesToIgnore: PageTitle[], allowedContentModels: string[]) {
  function revisionFilter(page: PageInfo & QueryRet): boolean {
    return !page.revisions
  }

  function contentModelFilter(page: PageInfo & QueryRet): boolean {
    return !allowedContentModels.includes(page.contentmodel)
  }

  function ignoredPagesFilter(page: PageInfo & QueryRet): boolean {
    return pagesToIgnore.includes(page.title) || pagesToIgnore.includes((page.title as string).replace(/ /g, '_') as PageTitle)
  }

  // Filter pages without revisions (#2091)
  const revisionIssues = pages.filter(revisionFilter)
  if (revisionIssues.length > 0) {
    logger.debug(`Ignoring pages without revisions: ${revisionIssues.join(', ')}`)
  }

  // Filter pages with unexpected content model (#2445)
  const contentModelIssues = pages.filter(contentModelFilter)
  if (contentModelIssues.length > 0) {
    logger.debug(`Ignoring pages with unexpected content model: ${contentModelIssues.join(', ')}`)
  }

  // Filter pages asked for by user
  const ignoreListIssues = pages.filter(ignoredPagesFilter)
  if (ignoreListIssues.length > 0) {
    logger.debug(`Ignoring pages in list: ${ignoreListIssues.join(', ')}`)
  }

  return pages
    .filter((p) => !revisionFilter(p))
    .filter((p) => !contentModelFilter(p))
    .filter((p) => !ignoredPagesFilter(p))
}

async function processPagesAndSaveToRedis(pages: QueryMwRet, pagesToIgnore: PageTitle[], allowedContentModels: string[], categoryTitles: Set<PageTitle> = new Set()) {
  const redirects: PageRedirect[] = []
  const pagesToRemove: (PageInfo & QueryRet)[] = []
  const filteredPages = filterPages(pages, pagesToIgnore, allowedContentModels)
  for (const page of filteredPages) {
    page.categories?.forEach((category) => {
      if (!category.hidden) categoryTitles.add(category.title)
    })
    if (page.redirects) {
      for (const target of page.redirects) {
        const targetExistsAsPage = (await RedisStore.pagesStore.exists(target.title)) || filteredPages.filter((a) => a.title == target.title).length > 0
        if (targetExistsAsPage) {
          logger.warn(
            `Page '${target.title}' found in redirects of '${page.title}' while it is also listed among titles to fetch ; scraper will automatically recover from this edge case`,
          )
          redirects.push({
            from: page.title,
            to: target.title,
          })
          pagesToRemove.push(page)
        } else {
          redirects.push({
            from: target.title,
            to: page.title,
            fragment: target.fragment,
          })
        }
      }
    }
  }
  for (const page of pagesToRemove) {
    filteredPages.splice(filteredPages.indexOf(page), 1)
  }

  const numPages = await RedisStore.pagesStore.setMany(mwRetToPageDetail(filteredPages))
  const numRedirects = await RedisStore.redirectsStore.setMany(
    redirects.reduce((acc, redirect) => {
      acc[redirect.from] = { from: redirect.from, to: redirect.to, fragment: redirect.fragment || '' }
      return acc
    }, {}),
  )
  const numThumbnails = filteredPages.filter((page) => !!page.thumbnail).length

  return { numPages, numRedirects, numThumbnails }
}

export async function getPagesByNamespace(
  namespace: number,
  pagesToIgnore?: PageTitle[],
  allowedContentModels: string[] = ['wikitext'],
  categoryTitles: Set<PageTitle> = new Set(),
  continueLimit?: number,
): Promise<void> {
  let totalPages = 0
  let gapContinue = ''
  const seenGapContinueValues: string[] = []

  // We don't really know how long this is going to take because we have a query continuation parameter which might induce
  // more request to make + we also get categories with more requests which is a recursive call
  const timeout = Math.max(Downloader.requestTimeout * 2, 10 * 60 * 1000)
  const timer = new Timer(() => {
    const errorMessage = `Worker timed out after ${timeout} ms`
    logger.error(errorMessage)
    throw new Error(errorMessage)
  }, timeout)

  try {
    /*
     * fetch page details in chunks and store them in redis
     */
    do {
      timer.reset()

      const resp = await Downloader.getPagesByNamespace(namespace, gapContinue)

      gapContinue = resp.gapContinue
      if (gapContinue) {
        if (seenGapContinueValues.includes(gapContinue)) {
          throw new Error(
            `Detected continuation cycle while fetching pages in namespace ${namespace}. ` +
              `Repeated gapContinue=${gapContinue} after visiting: [${seenGapContinueValues.join(', ')}]`,
          )
        }
        seenGapContinueValues.push(gapContinue)
      }
      const { numPages } = await processPagesAndSaveToRedis(resp.pages, pagesToIgnore, allowedContentModels, categoryTitles)
      totalPages += numPages
      logger.info(`Got [${numPages} / ${totalPages}] pages chunk from namespace [${namespace}]`)

      // Only for testing purposes
      if (--(continueLimit as number) < 0) break
    } while (gapContinue)
  } finally {
    timer.clear()
  }

  logger.info(`A total of [${totalPages}] pages has been found in namespace [${namespace}]`)
}

export function filterRedirects(mwPage: PageInfo & QueryRet) {
  if (mwPage.redirects) {
    mwPage.redirects = mwPage.redirects
      // drop redirects from talk (not subject) namespaces and from User namespace, except if namespace has been expressly requested
      .filter((redirect) => (redirect.ns % 2 === 0 && redirect.ns !== 2) || MediaWiki.namespacesToMirror.some((ns) => MediaWiki.namespaces[ns].num === redirect.ns))
  }
}

export function mwRetToPageDetail(pages: QueryMwRet): KVS<PageDetail> {
  const ret: KVS<PageDetail> = {}
  for (const val of pages) {
    const rev = val.revisions && val.revisions[0]
    const geo = val.coordinates && val.coordinates[0]
    let newThumbnail
    if (val.thumbnail) {
      newThumbnail = {
        width: val.thumbnail.width,
        height: val.thumbnail.height,
        source: val.thumbnail.source,
      }
    }
    let newCategoryinfo
    if (val.categoryinfo) {
      newCategoryinfo = {
        ...val.categoryinfo,
        nogallery: val.pageprops && val.pageprops.nogallery === '',
      }
    }
    let allCategories
    if (val.categories) {
      allCategories = val.categories.map(({ title }) => title.split(':').slice(1).join(':'))
    }
    ret[val.title] = {
      title: val.title,
      thumbnail: newThumbnail,
      categoryinfo: newCategoryinfo,
      categories: allCategories,
      missing: val.missing,
      pagelang: val.pagelanguagehtmlcode,
      pagedir: val.pagelanguagedir,
      ...(val.ns !== 0 ? { ns: val.ns } : {}),
      ...(val.contentmodel !== 'wikitext' ? { contentmodel: val.contentmodel } : {}),
      ...(rev ? { revisionId: rev.revid, timestamp: rev.timestamp } : {}),
      ...(val.flagged?.stable_revid ? { stableRevisionId: val.flagged.stable_revid } : {}),
      ...(geo ? { coordinates: `${geo.lat};${geo.lon}` } : {}),
    }
  }
  return ret
}

/**
 * Check for API availability at the given URL.
 *
 * @param downloader Downloader class handling web requests
 * @param url The URL to check.
 * @param loginCookie A string representing a cookie for login, if necessary.
 * @param allowedMimeTypes An array of allowed mime types for the response. If this is set, the check is only considered a
 * success if the response has a mime type in this array. Set to null to disable this filter.
 * @returns Promise resolving to true if the API is available.
 */
export async function checkApiAvailability(url: string, allowedMimeTypes = null): Promise<boolean> {
  try {
    const resp = await Downloader.request({ url: decodeURI(url), method: 'GET', maxRedirects: 0, ...Downloader.basicRequestOptions })

    // Read https://phabricator.wikimedia.org/T359187 to understand
    // the 'mediawiki-api-error' === 'rest-permission-error' exception
    const isSuccess = resp.status === 200 && (!resp.headers['mediawiki-api-error'] || resp.headers['mediawiki-api-error'] === 'rest-permission-error')

    let validMimeType = false
    if (!allowedMimeTypes) {
      // No MIME types to check, so consider the check passed.
      validMimeType = true
    } else {
      for (const mimeType of allowedMimeTypes) {
        if ((resp.headers['content-type'] as string).includes(mimeType)) {
          validMimeType = true
          break
        }
      }
    }

    return isSuccess && validMimeType
  } catch (err) {
    logger.debug('checkApiAvailability failed: ', cleanupAxiosError(err as any))
    return false
  }
}

export async function getPages(mainPage?: PageTitle, pages: PageTitle[] = [], pagesToIgnore: PageTitle[] = [], allowedContentModels: string[] = ['wikitext']) {
  const categorySet = new Set<PageTitle>()

  if (mainPage) {
    await getPagesByTitle([mainPage], 'mainPage', pagesToIgnore, allowedContentModels, categorySet)
  }

  if (pages.length) {
    await getPagesByTitle(pages, 'pages', pagesToIgnore, allowedContentModels, categorySet)
  } else {
    await pmap(
      MediaWiki.namespacesToMirror,
      (namespace: string) => {
        return getPagesByNamespace(MediaWiki.namespaces[namespace].num, pagesToIgnore, allowedContentModels, categorySet)
      },
      { concurrency: Downloader.workers },
    )
  }

  if (MediaWiki.getCategories) {
    const categoryIds = pagesToIgnore ? [...categorySet].filter((title: PageTitle) => !pagesToIgnore.includes(title)) : [...categorySet]
    await getPagesByTitle(categoryIds, 'categories', pagesToIgnore, allowedContentModels, new Set())
  }
}
