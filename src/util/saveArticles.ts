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
import { getSizeFromUrl } from './misc.js'
import { CONCURRENCY_LIMIT, MAX_FILE_DOWNLOAD_RETRIES } from './const.js'
import urlHelper from './url.helper.js'
import { Renderer } from '../renderers/abstract.renderer.js'
import RenderingContext from '../renderers/rendering.context.js'
import { zimCreatorMutex } from '../mutex.js'
import { truncateUtf8Bytes } from './misc.js'
import { isMainPage } from './articles.js'

export async function downloadFiles(fileStore: RKVS<FileDetail>, retryStore: RKVS<FileDetail>, zimCreator: Creator, dump: Dump, retryCounter = 0) {
  await retryStore.flush()
  const filesForAttempt = await fileStore.len()
  const filesTotal = filesForAttempt + dump.status.files.success + dump.status.files.fail
  const doRetry = retryCounter < MAX_FILE_DOWNLOAD_RETRIES

  logger.log(`${retryCounter ? 'RE-' : ''}Downloading a total of [${retryCounter ? filesForAttempt : filesTotal}] files...`)
  let prevPercentProgress: string

  await fileStore.iterateItems(Downloader.speed, async (fileDownloadPairs, workerId) => {
    logger.info(`Worker [${workerId}] processing batch of [${Object.keys(fileDownloadPairs).length}] files`)

    // todo align fileDownloadPairs and listOfArguments
    const listOfArguments = []
    for (const [path, { url, mult, width, kind }] of Object.entries(fileDownloadPairs)) {
      listOfArguments.push({ path, url, mult, width, kind })
    }

    const responses = await downloadBulk(listOfArguments)
    for (const resp of responses) {
      let isFailed = false
      try {
        if (resp.result && resp.result.content && resp.result.contentType) {
          // { FRONT_ARTICLE: 0 } is here very important, should we retrieve HTML we want to be sure the libzim will
          // not consider it for title index
          const item = new StringItem(resp.path, resp.result.contentType, null, { FRONT_ARTICLE: 0 }, resp.result.content)
          await zimCreatorMutex.runExclusive(() => zimCreator.addItem(item))
          dump.status.files.success += 1
        } else {
          isFailed = true
        }
      } catch {
        isFailed = true
      } finally {
        if (isFailed) {
          if (doRetry && resp.status !== 404) {
            await retryStore.set(resp.path, { url: resp.url, mult: resp.mult, width: resp.width, kind: resp.kind })
          } else {
            logger.warn(`Error downloading file [${urlHelper.deserializeUrl(resp.url)}], skipping`)
            dump.status.files.fail += 1
          }
        }
      }
      if ((dump.status.files.success + dump.status.files.fail) % (10 * Downloader.speed) === 0) {
        const percentProgress = (((dump.status.files.success + dump.status.files.fail) / filesTotal) * 100).toFixed(1)
        if (percentProgress !== prevPercentProgress) {
          prevPercentProgress = percentProgress
          logger.log(`Progress downloading files [${dump.status.files.success + dump.status.files.fail}/${filesTotal}] [${percentProgress}%]`)
        }
      }
    }
  })

  logger.log(`Done with ${retryCounter ? 'RE-' : ''}Downloading [${retryCounter ? filesForAttempt : filesTotal}] files`)

  if (doRetry) {
    const amountToRetry = await retryStore.len()
    if (amountToRetry > 0) {
      const ts = (retryCounter + 1) * 10
      logger.log(`Waiting ${ts} seconds before retrying ${amountToRetry} files`)
      await new Promise((res) => setTimeout(res, ts * 1000))
      await downloadFiles(retryStore, fileStore, zimCreator, dump, retryCounter + 1)
    } else {
      logger.log('No files to retry')
    }
  }
}

async function downloadBulk(listOfArguments: any[]): Promise<any> {
  try {
    // Enhance arguments array to have an index of the argument at hand
    const argsCopy = [].concat(listOfArguments.map((val, ind) => ({ val, ind })))
    const argList = []

    while (argsCopy.length > 0) {
      const arg = argsCopy.shift()
      argList.push(arg)
    }
    return pmap(
      argList,
      async (arg) => {
        const resp: any = {}
        resp.path = arg.val.path
        resp.url = arg.val.url
        resp.mult = arg.val.mult
        resp.width = arg.val.width
        resp.kind = arg.val.kind

        return Downloader.downloadContent(arg.val.url, arg.val.kind, false)
          .then((r) => {
            resp.result = r
            return resp
          })
          .catch((err) => {
            resp.status = err.response?.status
            return resp
          })
      },
      { concurrency: CONCURRENCY_LIMIT },
    )
  } catch (err) {
    logger.log(`Not able download in bulk due to ${err}`)
  }
}

async function getAllArticlesToKeep(articleDetailXId: RKVS<ArticleDetail>, dump: Dump, mainPageRenderer: Renderer, articlesRenderer: Renderer) {
  await articleDetailXId.iterateItems(Downloader.speed, async (articleKeyValuePairs) => {
    for (const [articleId, articleDetail] of Object.entries(articleKeyValuePairs)) {
      let rets: any
      try {
        const mainPage = isMainPage(articleId)
        const renderer = mainPage ? mainPageRenderer : articlesRenderer
        const leadSectionId = dump.nodet ? config.filters.leadSectionId : ''
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
  await articleDetailXId.iterateItems(Downloader.speed, (articleKeyValuePairs, workerId) => {
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

      logger.info(`Worker [${workerId}] processing batch of article ids [${logger.logifyArray(Object.keys(articleKeyValuePairs))}]`)

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
          const leadSectionId = dump.nodet ? config.filters.leadSectionId : ''
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
