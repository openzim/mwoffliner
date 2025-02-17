import pmap from 'p-map'
import deepmerge from 'deepmerge'
import * as logger from '../Logger.js'
import Downloader from '../Downloader.js'
import Timer from './Timer.js'
import RedisStore from '../RedisStore.js'
import MediaWiki from '../MediaWiki.js'
import { REDIRECT_PAGE_SIGNATURE } from './const.js'
import { cleanupAxiosError } from './misc.js'

export async function getArticlesByIds(articleIds: string[], downloader: Downloader, log = true): Promise<void> {
  let from = 0
  let numThumbnails = 0
  const MAX_BATCH_SIZE = 50
  const MAX_URL_SIZE = 7900 // in bytes, approx.

  const { articleDetailXId, redirectsXId } = RedisStore

  // using async iterator to spawn workers
  await pmap(
    ','
      .repeat(downloader.speed)
      .split(',')
      .map((_, i) => i),
    async (workerId: number) => {
      while (from < articleIds.length) {
        // Secure the request has the max articleIds as possible (within boudaries)
        const articleIdsBatch = articleIds.slice(from, from + MAX_BATCH_SIZE)
        let urlSize = encodeURIComponent(articleIdsBatch.join('|')).length
        while (urlSize > MAX_URL_SIZE) {
          urlSize -= encodeURIComponent(articleIdsBatch.pop()).length + 1
        }

        // Udpate articleIds slicing boundaries
        const to = from + articleIdsBatch.length
        if (log) {
          const progressPercent = Math.floor((to / articleIds.length) * 100)
          logger.log(`Worker [${workerId}] getting article range [${from}-${to}] of [${articleIds.length}] [${progressPercent}%]`)
        }
        from = to

        // Nothing to do
        if (!articleIdsBatch.length) {
          continue
        }

        // Retrieve the details and save them in Redis
        const _articleDetails = await downloader.getArticleDetailsIds(articleIdsBatch, numThumbnails < 100)
        const articlesWithThumbnail = Object.values(_articleDetails).filter((a) => !!a.thumbnail)
        numThumbnails += articlesWithThumbnail.length

        const articleDetails = mwRetToArticleDetail(_articleDetails)

        for (const [articleId, articleDetail] of Object.entries(_articleDetails)) {
          if (articleDetail.redirects && articleDetail.redirects.length) {
            await redirectsXId.setMany(
              articleDetail.redirects.reduce((acc, redirect) => {
                const rId = redirect.title
                return {
                  ...acc,
                  [rId]: { targetId: articleId, title: redirect.title },
                }
              }, {}),
            )
          }
        }
        const existingArticleDetails = await articleDetailXId.getMany(Object.keys(articleDetails))
        await articleDetailXId.setMany(deepmerge(existingArticleDetails, articleDetails))
      }
    },
    { concurrency: downloader.speed },
  )
}

async function saveToStore(
  articleDetails: KVS<ArticleDetail>,
  redirects: KVS<ArticleRedirect>,
  articleDetailXId: RKVS<ArticleDetail>,
  redirectsXId: RKVS<ArticleRedirect>,
): Promise<[number, Error?]> {
  try {
    const [numArticles] = await Promise.all([articleDetailXId.setMany(articleDetails), redirectsXId.setMany(redirects)])
    return [numArticles]
  } catch (err) {
    return [0, err]
  }
}

export function getArticlesByNS(ns: number, downloader: Downloader, articleIdsToIgnore?: string[], continueLimit?: number): Promise<void> {
  return new Promise(async (resolve, reject) => {
    let totalArticles = 0
    let chunk: { articleDetails: QueryMwRet; gapContinue: string }

    const { articleDetailXId, redirectsXId } = RedisStore

    const saveStorePromisQueue: Promise<[number, Error?]>[] = []

    /*
     * timer to detect freezes
     */
    const stages = ['Download ArticleDetails', 'Check Redirects', 'Store ArticleDetails in Redis', 'Clean Up left Promises']
    let curStage = 0
    const timeout = Math.max(downloader.requestTimeout * 2, 10 * 60 * 1000)
    const timer = new Timer(() => {
      const errorMessage = `Worker timed out at ${stages[curStage]}`
      logger.error(errorMessage)
      reject(new Error(errorMessage))
    }, timeout)

    try {
      /*
       * fetch article details in chunks and store them in redis
       */
      do {
        timer.reset()
        curStage = 0
        chunk = await downloader.getArticleDetailsNS(ns, chunk && chunk.gapContinue)

        if (articleIdsToIgnore) {
          Object.keys(chunk.articleDetails).forEach((articleId) => {
            const articleTitle = chunk.articleDetails[articleId].title
            if (articleIdsToIgnore.includes(articleTitle)) {
              delete chunk.articleDetails[articleId]
              logger.info(`Excluded article ${articleTitle}`)
            }
          })
        }

        curStage += 1
        const redirects: KVS<ArticleRedirect> = {}
        for (const [articleId, articleDetail] of Object.entries(chunk.articleDetails)) {
          if (articleDetail.redirects) {
            for (const target of articleDetail.redirects) {
              redirects[target.title] = {
                targetId: articleId,
                title: target.title,
              }
            }
          }
        }

        curStage += 1
        /*
         * Don't await redis, push promise into array queue
         * and check if the oldest promise finished in the meantime.
         * Like this we can store in redis simultaniously to downloading the
         * next articles, but also won't run into an ever increasing backlog.
         */
        const newSavePromise = saveToStore(mwRetToArticleDetail(chunk.articleDetails), redirects, articleDetailXId, redirectsXId)

        if (saveStorePromisQueue.length) {
          /*
           * in normal circumstances, where downloading is slower than storing,
           * this promise will always be resolved here already
           */
          const [numArticles, err] = await saveStorePromisQueue.shift()
          if (err) {
            timer.clear()
            reject(err)
            return
          }
          totalArticles += numArticles
          logger.log(`Got [${numArticles} / ${totalArticles}] articles chunk from namespace [${ns}]`)
        }

        saveStorePromisQueue.push(newSavePromise)

        // Only for testing purposes
        if (--(continueLimit as number) < 0) break
      } while (chunk.gapContinue)

      /*
       * clear up potentially still pending promises
       */
      curStage = 3
      const lastPending = await Promise.all(saveStorePromisQueue)
      const errored = lastPending.find(([, err]) => err)
      if (errored) {
        throw errored[1]
      }
      totalArticles += lastPending.reduce((a, [b]) => a + b, 0)
    } catch (err) {
      logger.error(`Error fetching article details at ${stages[curStage]}`)
      reject(err)
      return
    } finally {
      timer.clear()
    }

    logger.log(`A total of [${totalArticles}] articles has been found in namespace [${ns}]`)
    resolve()
  })
}

export function normalizeMwResponse(response: MwApiQueryResponse): QueryMwRet {
  if (!response) {
    return {}
  }
  const { normalized: _normalized, pages } = response

  const normalized = (_normalized || []).reduce((acc: any, { from, to }) => {
    acc[to] = from
    return acc
  }, {})

  return Object.values(pages).reduce((acc, page) => {
    const id = (normalized.hasOwnProperty(page.title) && normalized[page.title]) || page.title || ''
    if (typeof id !== 'string' || !id) {
      logger.warn(`Article Id is invalid - expected a string but got [${id}], converting to string and continuing`)
    }
    const articleId = String(id).replace(/ /g, '_')
    if (page.redirects) {
      page.redirects = page.redirects.map((redirect) => {
        // The API returns the redirect title (!?), we fake the
        // redirectId by putting the underscore. That way we
        // secure the URL rewritting works fine.
        redirect.title = String(redirect.title).replace(/ /g, '_')

        return redirect
      })
    }
    if (articleId) {
      return {
        ...acc,
        [articleId]: page,
      }
    } else {
      return acc
    }
  }, {})
}

export function mwRetToArticleDetail(obj: QueryMwRet): KVS<ArticleDetail> {
  const ret: KVS<ArticleDetail> = {}
  for (const key of Object.keys(obj)) {
    const val = obj[key]
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
    ret[key] = {
      title: val.title,
      categories: val.categories,
      subCategories: val.subCategories,
      thumbnail: newThumbnail,
      missing: val.missing,
      ...(val.ns !== 0 ? { ns: val.ns } : {}),
      ...(rev ? { revisionId: rev.revid, timestamp: rev.timestamp } : {}),
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
export async function checkApiAvailability(downloader: Downloader, url: string, allowedMimeTypes = null): Promise<boolean> {
  try {
    const resp = await downloader.request({ url: decodeURI(url), method: 'GET', maxRedirects: 0, ...downloader.basicRequestOptions })

    const isRedirectPage = typeof resp.data === 'string' && resp.data.startsWith(REDIRECT_PAGE_SIGNATURE)

    // Read https://phabricator.wikimedia.org/T359187 to understand
    // the 'mediawiki-api-error' === 'rest-permission-error' exception
    const isSuccess = resp.status === 200 && (!resp.headers['mediawiki-api-error'] || resp.headers['mediawiki-api-error'] === 'rest-permission-error')

    let validMimeType = false
    if (!allowedMimeTypes) {
      // No MIME types to check, so consider the check passed.
      validMimeType = true
    } else {
      for (const mimeType of allowedMimeTypes) {
        if (resp.headers['content-type'].includes(mimeType)) {
          validMimeType = true
          break
        }
      }
    }

    return !isRedirectPage && isSuccess && validMimeType
  } catch (err) {
    logger.info(cleanupAxiosError(err))
    return false
  }
}

export async function getArticleIds(downloader: Downloader, mainPage?: string, articleIds?: string[], articleIdsToIgnore?: string[]) {
  if (mainPage) {
    await getArticlesByIds([mainPage], downloader)
  }

  if (articleIds) {
    await getArticlesByIds(articleIds, downloader)
  } else {
    await pmap(
      MediaWiki.namespacesToMirror,
      (namespace: string) => {
        return getArticlesByNS(MediaWiki.namespaces[namespace].num, downloader, articleIdsToIgnore)
      },
      { concurrency: downloader.speed },
    )
  }
}
