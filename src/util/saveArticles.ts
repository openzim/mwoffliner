import * as logger from '../Logger.js'
import Downloader from '../Downloader.js'
import RedisStore from '../RedisStore.js'
import { Creator, StringItem } from '@openzim/libzim'

import pmap from 'p-map'
import * as domino from 'domino'
import { Dump } from '../Dump.js'
import Timer from './Timer.js'
import { jsPath } from './index.js'
import { config } from '../config.js'
import { getSizeFromUrl, parseRetryAfterHeader } from './misc.js'
import { FILES_DOWNLOAD_FAILURE_MINIMUM_FOR_CHECK, FILES_DOWNLOAD_FAILURE_TRESHOLD_PER_TEN_THOUSAND, MAX_FILE_DOWNLOAD_RETRIES } from './const.js'
import urlHelper from './url.helper.js'
import { Renderer } from '../renderers/abstract.renderer.js'
import RenderingContext from '../renderers/rendering.context.js'
import { fileDownloadMutex, zimCreatorMutex } from '../mutex.js'
import { truncateUtf8Bytes } from './misc.js'
import { isMainPage } from './articles.js'
import RedisQueue from './RedisQueue.js'

export async function downloadFiles(fileStore: RKVS<FileDetail>, zimCreator: Creator, dump: Dump) {
  interface HostData {
    filesToDownload: RedisQueue<FileToDownload>
    lastRequestDate?: number
    requestInterval: number
    notBeforeDate?: number
    downloadSuccess: number
    downloadFailure: number
    downloadsComplete: boolean
  }

  let prevPercentProgress: string

  // create structure + Redis queue to requests hosts in a responsible manner
  const hosts = new Map<string, HostData>()
  const filesTotal = await RedisStore.filesToDownloadXPath.len()

  await RedisStore.filesToDownloadXPath.iterateItems(1, async (filesToDownload: KVS<FileDetail>) => {
    for (const [path, { url, mult, width, kind }] of Object.entries(filesToDownload)) {
      const hostname = new URL(urlHelper.deserializeUrl(url)).hostname
      if (!hosts.has(hostname)) {
        const filesToDownload = new RedisQueue<FileToDownload>(RedisStore.client, `${hostname}-files`)
        RedisStore.filesQueues.push(filesToDownload)
        filesToDownload.flush()
        hosts.set(hostname, {
          filesToDownload,
          requestInterval: 10, // initial request interval is 10 ms
          downloadSuccess: 0,
          downloadFailure: 0,
          downloadsComplete: false,
        })
      }
      hosts.get(hostname).filesToDownload.push({
        path: path,
        url: url,
        mult: mult,
        width: width,
        kind: kind,
        downloadAttempts: 0,
      })
    }
  })

  await RedisStore.filesToDownloadXPath.flush()

  /**
   * Return next file ready to download or wait if all hosts need to make a pause.
   * Return null when there is no more file to download.
   */
  async function getNextFileToDownload(): Promise<{ fileToDownload: FileToDownload; hostData: HostData; hostname: string }> {
    // loop until we've found a file to download or list is empty
    while (true) {
      // check if all donwloads have completed and exit
      const hostValues = Array.from(hosts.values())
      const completedHosts = hostValues.reduce((buf, host) => {
        return host.downloadsComplete ? buf + 1 : 0
      }, 0)
      if (completedHosts == hostValues.length) {
        return null
      }

      for (const [hostname, hostData] of hosts.entries()) {
        // check conditions which leads to ignore current host
        if (
          hostData.downloadsComplete ||
          (hostData.notBeforeDate && hostData.notBeforeDate > Date.now()) ||
          (hostData.lastRequestDate && hostData.lastRequestDate + hostData.requestInterval > Date.now())
        ) {
          continue
        }

        // grab next item from Redis queue
        const fileToDownload = await hostData.filesToDownload.pop()
        if (!fileToDownload) {
          hostData.downloadsComplete = true
          continue
        }

        // modify lastRequestDate immediately so that all workers are aware
        hostData.lastRequestDate = Date.now()
        return { fileToDownload, hostData, hostname }
      }

      // pause few milliseconds, no host has something to process (just to not burn CPU)
      await new Promise((resolve) => {
        setTimeout(resolve, 10)
      })
    }
  }

  /**
   * Really try to download one file, handling potential errors received to slow down host, stop scraper, ignore failed file
   * @param fileToDownload information about the file to download
   * @param hostname hostname to process
   * @param hostData data about the host to process
   * @param workerId ID of worker currently processing this download
   */
  async function workerDownloadFile(fileToDownload: FileToDownload, hostname: string, hostData: HostData, workerId: number) {
    if ((dump.status.files.success + dump.status.files.fail) % (10 * Downloader.speed) === 0) {
      const percentProgress = (((dump.status.files.success + dump.status.files.fail) / filesTotal) * 100).toFixed(1)
      if (percentProgress !== prevPercentProgress) {
        prevPercentProgress = percentProgress
        logger.log(`Progress downloading files [${dump.status.files.success + dump.status.files.fail}/${filesTotal}] [${percentProgress}%]`)
      }
      if (dump.status.files.fail > FILES_DOWNLOAD_FAILURE_MINIMUM_FOR_CHECK && (dump.status.files.fail * 10000) / filesTotal > FILES_DOWNLOAD_FAILURE_TRESHOLD_PER_TEN_THOUSAND) {
        throw new Error(`Too many files failed to download: [${dump.status.files.fail}/${filesTotal}]`)
      }
    }

    fileToDownload.downloadAttempts += 1
    logger.info(`Worker ${workerId} downloading ${urlHelper.deserializeUrl(fileToDownload.url)} (${fileToDownload.kind})`)
    await Downloader.downloadContent(fileToDownload.url, fileToDownload.kind, false)
      .then(async (resp) => {
        if (resp && resp.content && resp.contentType) {
          // { FRONT_ARTICLE: 0 } is here very important, should we retrieve HTML we want to be sure the libzim will
          // not consider it for title index
          const item = new StringItem(fileToDownload.path, resp.contentType, null, { FRONT_ARTICLE: 0 }, resp.content)
          await zimCreatorMutex.runExclusive(() => zimCreator.addItem(item))
          dump.status.files.success += 1
          hostData.downloadSuccess += 1
        } else {
          throw new Error(`Bad response received: ${resp}`)
        }
      })
      .catch(async (err) => {
        if (fileToDownload.downloadAttempts > MAX_FILE_DOWNLOAD_RETRIES || (err.response && err.response.status == 404)) {
          logger.warn(`Error downloading file [${urlHelper.deserializeUrl(fileToDownload.url)}] [status=${err.response?.status}], skipping`)
          dump.status.files.fail += 1
          hostData.downloadFailure += 1
        } else {
          if (err.response) {
            const retryAfterHeader = err.response.headers['retry-after']?.toString()
            if (retryAfterHeader) {
              const retryDate = parseRetryAfterHeader(retryAfterHeader)
              if (retryDate) {
                hostData.notBeforeDate = retryDate
                logger.log(`Received a [Retry-After=${retryAfterHeader}], pausing down ${hostname} until ${hostData.notBeforeDate}`)
              } else {
                logger.warn(`Received a [Retry-After=${retryAfterHeader}] from ${hostname} but failed to interpret it`)
              }
            }
          }
          // slow down except for wikimedia thumbnails whose server is known to be lying (see https://github.com/openzim/mwoffliner/issues/2572)
          if (err.response && [429, 503, 524].includes(err.response.status) && !fileToDownload.url.match(/^https?:\/\/upload\.wikimedia\.org\/.*\/thumb\//)) {
            hostData.requestInterval = hostData.requestInterval * 1.2 // 1.2 is arbitrary value to progressively slow requests to host down
            logger.log(`Received a [status=${err.response.status}], slowing down ${hostname} to ${hostData.requestInterval}ms interval`)
          }
          await hostData.filesToDownload.push(fileToDownload)
        }
      })
  }

  await pmap(
    Array.from({ length: Downloader.speed }, (_, i) => i),
    async (workerId: number) => {
      while (true) {
        // get next file to download in a Mutex (we do not want two workers trying to get next file at same time
        // since we need to take into account limits per hostname, so this getNextFileToDownload will update
        // data about load per host)
        const nextFileData = await fileDownloadMutex.runExclusive(getNextFileToDownload)
        if (!nextFileData) break
        const { fileToDownload, hostname, hostData } = nextFileData
        await workerDownloadFile(fileToDownload, hostname, hostData, workerId)
      }
    },
    { concurrency: Downloader.speed },
  )

  logger.log(
    `Done with downloading ${filesTotal} files: ${dump.status.files.success} success, ${dump.status.files.fail} fail: `,
    JSON.stringify(Object.fromEntries([...hosts].map(([hostname, hostData]) => [hostname, { success: hostData.downloadSuccess, fail: hostData.downloadFailure }])), null, '\t'),
  )
}

async function getAllArticlesToKeep(articleDetailXId: RKVS<ArticleDetail>, dump: Dump, mainPageRenderer: Renderer, articlesRenderer: Renderer) {
  await articleDetailXId.iterateItems(Downloader.speed, async (articleKeyValuePairs) => {
    for (const [articleId, articleDetail] of Object.entries(articleKeyValuePairs)) {
      let rets: any
      try {
        const mainPage = isMainPage(articleId)
        const renderer = mainPage ? mainPageRenderer : articlesRenderer
        const leadSectionId = dump.nodet && !articleDetail.contentmodel && !articleDetail.missing ? config.filters.leadSectionId : ''
        const articleUrl = mainPage ? Downloader.getMainPageUrl(articleId) : Downloader.getArticleUrl(articleId, { sectionId: leadSectionId })

        rets = await Downloader.getArticle(articleId, articleDetailXId, renderer, articleUrl, dump, articleDetail)
        for (const { articleId, html } of rets) {
          if (!html) {
            continue
          }

          const doc = domino.createDocument(html)
          if (!mainPage && !(await dump.customProcessor.shouldKeepArticle(articleId, doc))) {
            articleDetailXId.delete(articleId)
          }
        }
      } catch (err) {
        logger.warn(`Error downloading article [${articleId}], skipping`, err)
        articleDetailXId.delete(articleId)
      }
    }
  })
}

function flattenPromises(promisArr: [string, Promise<Error>][]): [string, Promise<Error>] {
  return [
    // first articleId
    promisArr[0][0],
    // promise resolving to first error or void
    (async () => {
      const resolved = await Promise.all(promisArr.map((p) => p[1]))
      return resolved.find((err) => err)
    })(),
  ]
}

/*
 * Parse fetched article HTML, store files
 * and dependencies and save in Zim
 */
async function saveArticle(
  zimCreator: Creator,
  finalHTML: string,
  mediaDependencies: any,
  imageDependencies: any,
  videoDependencies: any,
  subtitles: any,
  articleId: string,
  articleTitle: string,
): Promise<Error> {
  try {
    const filesToDownload: KVS<FileDetail> = {}

    if (subtitles?.length > 0) {
      subtitles.forEach((s) => {
        filesToDownload[s.path] = { url: s.url, kind: 'subtitle' }
      })
    }

    if (mediaDependencies && mediaDependencies.length) {
      const existingVals = await RedisStore.filesToDownloadXPath.getMany(mediaDependencies.map((dep) => dep.path))

      for (const dep of mediaDependencies) {
        const { mult, width } = getSizeFromUrl(dep.url)
        const existingVal = existingVals[dep.path]
        const currentDepIsHigherRes = !existingVal || existingVal.width < (width || 10e6) || existingVal.mult < (mult || 1)
        if (currentDepIsHigherRes) {
          filesToDownload[dep.path] = {
            url: urlHelper.serializeUrl(dep.url),
            kind: 'media',
            mult,
            width,
          }
        }
      }
    }

    if (imageDependencies && imageDependencies.length) {
      const existingVals = await RedisStore.filesToDownloadXPath.getMany(imageDependencies.map((dep) => dep.path))

      for (const dep of imageDependencies) {
        const { mult, width } = getSizeFromUrl(dep.url)
        const existingVal = existingVals[dep.path]
        const currentDepIsHigherRes = !existingVal || existingVal.width < (width || 10e6) || existingVal.mult < (mult || 1)
        if (currentDepIsHigherRes) {
          filesToDownload[dep.path] = {
            url: urlHelper.serializeUrl(dep.url),
            kind: 'image',
            mult,
            width,
          }
        }
      }
    }

    if (videoDependencies && videoDependencies.length) {
      const existingVals = await RedisStore.filesToDownloadXPath.getMany(videoDependencies.map((dep) => dep.path))

      for (const dep of videoDependencies) {
        const { mult, width } = getSizeFromUrl(dep.url)
        const existingVal = existingVals[dep.path]
        const currentDepIsHigherRes = !existingVal || existingVal.width < (width || 10e6) || existingVal.mult < (mult || 1)
        if (currentDepIsHigherRes) {
          filesToDownload[dep.path] = {
            url: urlHelper.serializeUrl(dep.url),
            kind: 'video',
            mult,
            width,
          }
        }
      }
    }

    await RedisStore.filesToDownloadXPath.setMany(filesToDownload)

    const zimArticle = new StringItem(articleId, 'text/html', truncateUtf8Bytes(articleTitle, 245), { FRONT_ARTICLE: 1 }, finalHTML)
    await zimCreatorMutex.runExclusive(() => zimCreator.addItem(zimArticle))

    return null
  } catch (err) {
    return err
  }
}

/*
 * Fetch Articles
 */
export async function saveArticles(zimCreator: Creator, dump: Dump) {
  const jsModuleDependencies = new Set<string>()
  const cssModuleDependencies = new Set<string>()
  const staticFilesList = new Set<string>()
  let jsConfigVars = ''
  let prevPercentProgress: string
  const { articleDetailXId } = RedisStore
  const articlesTotal = await articleDetailXId.len()

  // number of articles allowed to fail is the greater of 5 or 0.001% (1 per 100k) articles
  dump.maxHardFailedArticles = Math.max(5, Math.floor(articlesTotal / 100000))

  if (dump.customProcessor?.shouldKeepArticle) {
    await getAllArticlesToKeep(articleDetailXId, dump, RenderingContext.mainPageRenderer, RenderingContext.articlesRenderer)
  }

  const stages = ['Download Article and dependencies', 'Parse and Save to ZIM', 'Await left-over promises']
  // depending on which renderer we use, we can have up to 2 requests to make to download article details
  // each request we need to make can be retried 10 times. Each retry attempttakes at most requestTimeout + retry interval
  // retry interval is an exponentional value from 1 to 60s
  // we assume rest of processing is "fast" and takes at most 1 minute
  const timeout = 2 * (Downloader.requestTimeout * 10 + (1 + 2 + 4 + 8 + 16 + 32 + 60 * 4) * 1000) + 60000
  await articleDetailXId.iterateItems(Downloader.speed, (articleKeyValuePairs, runningWorkers) => {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      /*
       * timer to detect freezes
       */
      let curStage = 0
      let curArticle = ''
      const timer = new Timer(() => {
        const errorMessage = `Worker timed out after ${timeout} ms at ${stages[curStage]} ${curArticle}`
        logger.error(errorMessage)
        reject(new Error(errorMessage))
      }, timeout)

      logger.info(`Worker processing batch of article ids [${logger.logifyArray(Object.keys(articleKeyValuePairs))}] - ${runningWorkers} worker(s) running`)

      const parsePromiseQueue: [string, Promise<Error>][] = []

      for (const [articleId, articleDetail] of Object.entries(articleKeyValuePairs)) {
        timer.reset()
        curStage = 0
        curArticle = articleId
        const promises: [string, Promise<Error>][] = []

        let rets: any
        try {
          const mainPage = isMainPage(articleId)
          const renderer = mainPage ? RenderingContext.mainPageRenderer : RenderingContext.articlesRenderer
          const leadSectionId = dump.nodet && !articleDetail.contentmodel && !articleDetail.missing ? config.filters.leadSectionId : ''
          const articleUrl = mainPage ? Downloader.getMainPageUrl(articleId) : Downloader.getArticleUrl(articleId, { sectionId: leadSectionId })

          rets = await Downloader.getArticle(articleId, articleDetailXId, renderer, articleUrl, dump, articleDetail)

          curStage += 1
          for (const {
            articleId,
            displayTitle: articleTitle,
            html: finalHTML,
            mediaDependencies,
            imageDependencies,
            videoDependencies,
            moduleDependencies,
            staticFiles,
            subtitles,
          } of rets) {
            if (!finalHTML) {
              logger.warn(`No HTML returned for article [${articleId}], skipping`)
              continue
            }

            for (const dep of moduleDependencies.jsDependenciesList || []) {
              jsModuleDependencies.add(dep)
            }
            for (const dep of moduleDependencies.styleDependenciesList || []) {
              cssModuleDependencies.add(dep)
            }

            for (const file of staticFiles) {
              staticFilesList.add(file)
            }

            jsConfigVars = moduleDependencies.jsConfigVars || ''

            /*
             * getModuleDependencies and downloader.getArticle are
             * network heavy while parsing and saving is I/O.
             * To parse and download simultaniously, we don't await on save,
             * but instead cache the promise in a queue and check it later
             */
            promises.push([articleId, saveArticle(zimCreator, finalHTML, mediaDependencies, imageDependencies, videoDependencies, subtitles, articleId, articleTitle)])
          }
        } catch (err) {
          logger.error(`Error downloading/rendering article ${articleId}`)
          reject(err)
          return
        }

        curStage += 1
        if (parsePromiseQueue.length) {
          const [articleId, parsePromise] = parsePromiseQueue.shift()
          curArticle = articleId
          /*
           * in normal circumstances, where downloading is slower than
           * saving, this promise will always be resolved here already
           */
          const err = await parsePromise
          if (err) {
            console.log(err)

            logger.error(`Error parsing article ${articleId}`)
            timer.clear()
            reject(err)
            return
          }
          dump.status.articles.success += 1
        }

        if (promises.length) {
          parsePromiseQueue.push(flattenPromises(promises))
        }

        if ((dump.status.articles.success + dump.status.articles.hardFail + dump.status.articles.softFail) % 10 === 0) {
          const percentProgress = (((dump.status.articles.success + dump.status.articles.hardFail + dump.status.articles.softFail) / articlesTotal) * 100).toFixed(1)
          if (percentProgress !== prevPercentProgress) {
            prevPercentProgress = percentProgress
            logger.log(
              `Progress downloading articles [${
                dump.status.articles.success + dump.status.articles.hardFail + dump.status.articles.softFail
              }/${articlesTotal}] [${percentProgress}%]`,
            )
          }
        }
      }

      /*
       * clear up potentially still pending promises
       */
      curStage += 1
      if (parsePromiseQueue.length) {
        const [articleId, parsePromise] = flattenPromises(parsePromiseQueue)
        curArticle = articleId
        const err = await parsePromise
        if (err) {
          timer.clear()
          reject(err)
          return
        }
        dump.status.articles.success += parsePromiseQueue.length
      }

      timer.clear()
      resolve()
    })
  })

  logger.log(`Done with downloading a total of [${articlesTotal}] articles`)

  if (jsConfigVars) {
    const jsConfigVarArticle = new StringItem(jsPath('jsConfigVars', config.output.dirs.mediawiki), 'application/javascript', null, { FRONT_ARTICLE: 0 }, jsConfigVars)
    await zimCreatorMutex.runExclusive(() => zimCreator.addItem(jsConfigVarArticle))
  }

  return {
    staticFilesList,
    jsModuleDependencies,
    cssModuleDependencies,
  }
}
