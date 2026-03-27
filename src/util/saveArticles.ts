import * as logger from '../Logger.js'
import Downloader from '../Downloader.js'
import RedisStore from '../RedisStore.js'
import { Creator, StringItem } from '@openzim/libzim'

import * as domino from 'domino'
import { Dump } from '../Dump.js'
import Timer from './Timer.js'
import { config } from '../config.js'
import { getSizeFromUrl } from './misc.js'
import urlHelper from './url.helper.js'
import { Renderer } from '../renderers/abstract.renderer.js'
import RenderingContext from '../renderers/rendering.context.js'
import { zimCreatorMutex } from '../mutex.js'
import FileManager from './FileManager.js'
import { truncateUtf8Bytes } from './misc.js'
import { isMainPage } from './articles.js'

async function getAllArticlesToKeep(articleDetailXId: RKVS<ArticleDetail>, dump: Dump, articlesRenderer: Renderer) {
  await articleDetailXId.iterateItems(Downloader.speed, async (articleKeyValuePairs) => {
    for (const [articleId, articleDetail] of Object.entries(articleKeyValuePairs)) {
      let rets: any
      try {
        const mainPage = isMainPage(articleId)
        const leadSectionId = dump.nodet && !articleDetail.contentmodel && !articleDetail.missing ? config.filters.leadSectionId : ''
        const articleUrl = Downloader.getArticleUrl(articleId, { sectionId: leadSectionId })

        rets = await Downloader.getArticle(articleId, articleDetailXId, articlesRenderer, articleUrl, dump, articleDetail)
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
    const articleFiles: KVS<FileDetail> = {}

    if (subtitles?.length > 0) {
      subtitles.forEach((s) => {
        articleFiles[s.path] = { url: s.url, kind: 'subtitle' }
      })
    }

    if (mediaDependencies && mediaDependencies.length) {
      for (const dep of mediaDependencies) {
        const { mult, width } = getSizeFromUrl(dep.url)
        articleFiles[dep.path] = { url: urlHelper.serializeUrl(dep.url), kind: 'media', mult, width }
      }
    }

    if (imageDependencies && imageDependencies.length) {
      for (const dep of imageDependencies) {
        const urlSize = getSizeFromUrl(dep.url)
        const width = dep.width || urlSize.width
        const mult = urlSize.mult
        articleFiles[dep.path] = { url: urlHelper.serializeUrl(dep.url), kind: 'image', mult, width }
      }
    }

    if (videoDependencies && videoDependencies.length) {
      for (const dep of videoDependencies) {
        const { mult, width } = getSizeFromUrl(dep.url)
        articleFiles[dep.path] = { url: urlHelper.serializeUrl(dep.url), kind: 'video', mult, width }
      }
    }

    await FileManager.addManyFilesToProcess(articleFiles)

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
  let prevPercentProgress: string
  const { articleDetailXId } = RedisStore
  const articlesTotal = await articleDetailXId.len()

  // number of articles allowed to fail is the greater of 5 or 0.001% (1 per 100k) articles
  dump.maxHardFailedArticles = Math.max(5, Math.floor(articlesTotal / 100000))

  if (dump.customProcessor?.shouldKeepArticle) {
    await getAllArticlesToKeep(articleDetailXId, dump, RenderingContext.articlesRenderer)
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
          const leadSectionId = dump.nodet && !articleDetail.contentmodel && !articleDetail.missing ? config.filters.leadSectionId : ''
          const articleUrl = Downloader.getArticleUrl(articleId, { sectionId: leadSectionId })

          rets = await Downloader.getArticle(articleId, articleDetailXId, RenderingContext.articlesRenderer, articleUrl, dump, articleDetail)

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

            /*
             * downloader.getArticle is network heavy while parsing and saving is I/O.
             * To parse and download simultaniously, we don't await on save, but instead
             * cache the promise in a queue and check it later
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
            logger.error(err)

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

  return {
    staticFilesList,
    jsModuleDependencies,
    cssModuleDependencies,
  }
}
