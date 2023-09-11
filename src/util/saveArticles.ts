import * as logger from '../Logger.js'
import Downloader from '../Downloader.js'
import RedisStore from '../RedisStore.js'
import { ZimArticle, ZimCreator } from '@openzim/libzim'

import pmap from 'p-map'
import * as domino from 'domino'
import { Dump } from '../Dump.js'
import Timer from './Timer.js'
import { jsPath } from './index.js'
import { config } from '../config.js'
import { getSizeFromUrl, cleanupAxiosError } from './misc.js'
import { CONCURRENCY_LIMIT, DELETED_ARTICLE_ERROR, MAX_FILE_DOWNLOAD_RETRIES } from './const.js'
import urlHelper from './url.helper.js'
import { RendererBuilderOptions, Renderer } from '../renderers/abstract.renderer.js'
import { RendererBuilder } from '../renderers/renderer.builder.js'

export async function downloadFiles(fileStore: RKVS<FileDetail>, retryStore: RKVS<FileDetail>, zimCreator: ZimCreator, dump: Dump, downloader: Downloader, retryCounter = 0) {
  await retryStore.flush()
  const filesForAttempt = await fileStore.len()
  const filesTotal = filesForAttempt + dump.status.files.success + dump.status.files.fail
  const doRetry = retryCounter < MAX_FILE_DOWNLOAD_RETRIES

  logger.log(`${retryCounter ? 'RE-' : ''}Downloading a total of [${retryCounter ? filesForAttempt : filesTotal}] files...`)
  let prevPercentProgress: string

  await fileStore.iterateItems(downloader.speed, async (fileDownloadPairs, workerId) => {
    logger.info(`Worker [${workerId}] processing batch of [${Object.keys(fileDownloadPairs).length}] files`)

    // todo align fileDownloadPairs and listOfArguments
    const listOfArguments = []
    for (const [path, { url, namespace, mult, width }] of Object.entries(fileDownloadPairs)) {
      listOfArguments.push({ path, url, namespace, mult, width })
    }

    const responses = await downloadBulk(listOfArguments, downloader)
    for (const resp of responses) {
      let isFailed = false
      try {
        if (resp.result && resp.result.content) {
          const article = new ZimArticle({
            url: resp.path,
            data: resp.result.content,
            ns: resp.namespace || 'I',
            mimeType: resp.result.responseHeaders['content-type'],
          })
          zimCreator.addArticle(article)
          dump.status.files.success += 1
        } else {
          isFailed = true
        }
      } catch (err) {
        isFailed = true
      } finally {
        if (isFailed) {
          if (doRetry && resp.status !== 404) {
            await retryStore.set(resp.path, { url: resp.url, namespace: resp.namespace, mult: resp.mult, width: resp.width })
          } else {
            logger.warn(`Error downloading file [${urlHelper.deserializeUrl(resp.url)}], skipping`)
            dump.status.files.fail += 1
          }
        }
      }
      if ((dump.status.files.success + dump.status.files.fail) % 10 === 0) {
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
      await downloadFiles(retryStore, fileStore, zimCreator, dump, downloader, retryCounter + 1)
    } else {
      logger.log('No files to retry')
    }
  }
}

async function downloadBulk(listOfArguments: any[], downloader: Downloader): Promise<any> {
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
        resp.namespace = arg.val.namespace
        resp.mult = arg.val.mult
        resp.width = arg.val.width

        return downloader
          .downloadContent(arg.val.url, false)
          .then((r) => {
            resp.result = r
            resp.path += resp.result.responseHeaders.path_postfix || ''
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

async function getAllArticlesToKeep(downloader: Downloader, articleDetailXId: RKVS<ArticleDetail>, dump: Dump, mainPageRenderer: Renderer, articlesRenderer: Renderer) {
  await articleDetailXId.iterateItems(downloader.speed, async (articleKeyValuePairs) => {
    for (const [articleId, articleDetail] of Object.entries(articleKeyValuePairs)) {
      const _moduleDependencies = await downloader.getModuleDependencies(articleDetail.title)
      try {
        const articleUrl = getArticleUrl(downloader, dump, articleId)
        let rets: any
        if (dump.isMainPage) {
          rets = await downloader.getArticle(
            downloader.webp,
            _moduleDependencies,
            articleId,
            articleDetailXId,
            mainPageRenderer,
            articleUrl,
            dump,
            articleDetail,
            dump.isMainPage(articleId),
          )
        }
        rets = await downloader.getArticle(
          downloader.webp,
          _moduleDependencies,
          articleId,
          articleDetailXId,
          articlesRenderer,
          articleUrl,
          dump,
          articleDetail,
          dump.isMainPage(articleId),
        )
        for (const { articleId, html } of rets) {
          if (!html) {
            continue
          }

          const doc = domino.createDocument(html)
          if (!dump.isMainPage(articleId) && !(await dump.customProcessor.shouldKeepArticle(articleId, doc))) {
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
  zimCreator: ZimCreator,
  finalHTML: string,
  mediaDependencies: any,
  subtitles: any,
  articleId: string,
  articleTitle: string,
  articleDetail: any,
): Promise<Error> {
  try {
    const filesToDownload: KVS<FileDetail> = {}

    subtitles.forEach((s) => {
      filesToDownload[s.path] = { url: s.url, namespace: '-' }
    })

    if (mediaDependencies && mediaDependencies.length) {
      const existingVals = await RedisStore.filesToDownloadXPath.getMany(mediaDependencies.map((dep) => dep.path))

      for (const dep of mediaDependencies) {
        const { mult, width } = getSizeFromUrl(dep.url)
        const existingVal = existingVals[dep.path]
        const currentDepIsHigherRes = !existingVal || existingVal.width < (width || 10e6) || existingVal.mult < (mult || 1)
        if (currentDepIsHigherRes) {
          filesToDownload[dep.path] = {
            url: urlHelper.serializeUrl(dep.url),
            mult,
            width,
          }
        }
      }
    }

    await RedisStore.filesToDownloadXPath.setMany(filesToDownload)

    const zimArticle = new ZimArticle({
      url: articleId,
      data: finalHTML,
      ns: articleDetail.ns === 14 ? 'U' : 'A',
      mimeType: 'text/html',
      title: articleTitle,
      shouldIndex: true,
    })

    zimCreator.addArticle(zimArticle)

    return null
  } catch (err) {
    return err
  }
}

export function getArticleUrl(downloader: Downloader, dump: Dump, articleId: string): string {
  return `${dump.isMainPage(articleId) ? downloader.baseUrlForMainPage : downloader.baseUrl}${encodeURIComponent(articleId)}`
}

/*
 * Fetch Articles
 */
export async function saveArticles(zimCreator: ZimCreator, downloader: Downloader, dump: Dump, forceRender = null) {
  const jsModuleDependencies = new Set<string>()
  const cssModuleDependencies = new Set<string>()
  let jsConfigVars = ''
  let prevPercentProgress: string
  const { articleDetailXId } = RedisStore
  const articlesTotal = await articleDetailXId.len()

  const rendererBuilder = new RendererBuilder()

  let rendererBuilderOptions: RendererBuilderOptions

  let mainPageRenderer
  let articlesRenderer
  if (forceRender) {
    rendererBuilderOptions = {
      renderType: 'specific',
      renderName: forceRender,
    }
    // All articles and main page will use the same renderer if 'forceRender' is specified
    mainPageRenderer = await rendererBuilder.createRenderer(rendererBuilderOptions)
    articlesRenderer = await rendererBuilder.createRenderer(rendererBuilderOptions)
  } else {
    rendererBuilderOptions = {
      renderType: 'desktop',
    }
    mainPageRenderer = await rendererBuilder.createRenderer(rendererBuilderOptions)
    articlesRenderer = await rendererBuilder.createRenderer({ ...rendererBuilderOptions, renderType: 'mobile' })
  }

  if (dump.customProcessor?.shouldKeepArticle) {
    await getAllArticlesToKeep(downloader, articleDetailXId, dump, mainPageRenderer, articlesRenderer)
  }

  const stages = ['Download Article', 'Get module dependencies', 'Parse and Save to ZIM', 'Await left-over promises']
  const timeout = Math.max(downloader.requestTimeout * 2, 10 * 60 * 1000)

  await articleDetailXId.iterateItems(downloader.speed, (articleKeyValuePairs, workerId) => {
    return new Promise(async (resolve, reject) => {
      /*
       * timer to detect freezes
       */
      let curStage = 0
      let curArticle = ''
      const timer = new Timer(() => {
        const errorMessage = `Worker timed out at ${stages[curStage]} ${curArticle}`
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

        const _moduleDependencies = await downloader.getModuleDependencies(articleDetail.title)

        let rets: any
        try {
          const articleUrl = getArticleUrl(downloader, dump, articleId)
          if (dump.isMainPage) {
            rets = await downloader.getArticle(
              downloader.webp,
              _moduleDependencies,
              articleId,
              articleDetailXId,
              mainPageRenderer,
              articleUrl,
              dump,
              articleDetail,
              dump.isMainPage(articleId),
            )
          }
          rets = await downloader.getArticle(
            downloader.webp,
            _moduleDependencies,
            articleId,
            articleDetailXId,
            articlesRenderer,
            articleUrl,
            dump,
            articleDetail,
            dump.isMainPage(articleId),
          )

          for (const { articleId, displayTitle: articleTitle, html: finalHTML, mediaDependencies, subtitles } of rets) {
            if (!finalHTML) {
              logger.warn(`No HTML returned for article [${articleId}], skipping`)
              continue
            }

            curStage += 1
            for (const dep of _moduleDependencies.jsDependenciesList) {
              jsModuleDependencies.add(dep)
            }
            for (const dep of _moduleDependencies.styleDependenciesList) {
              cssModuleDependencies.add(dep)
            }
            jsConfigVars = jsConfigVars || _moduleDependencies.jsConfigVars

            /*
             * getModuleDependencies and downloader.getArticle are
             * network heavy while parsing and saving is I/O.
             * To parse and download simultaniously, we don't await on save,
             * but instead cache the promise in a queue and check it later
             */
            promises.push([articleId, saveArticle(zimCreator, finalHTML, mediaDependencies, subtitles, articleId, articleTitle, articleDetail)])
          }
        } catch (err) {
          dump.status.articles.fail += 1
          logger.error(`Error downloading article ${articleId}`)
          if ((!err.response || err.response.status !== 404) && err.message !== DELETED_ARTICLE_ERROR) {
            reject(cleanupAxiosError(err))
            return
          }
        }

        if (parsePromiseQueue.length) {
          curStage += 1
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

        if ((dump.status.articles.success + dump.status.articles.fail) % 10 === 0) {
          const percentProgress = (((dump.status.articles.success + dump.status.articles.fail) / articlesTotal) * 100).toFixed(1)
          if (percentProgress !== prevPercentProgress) {
            prevPercentProgress = percentProgress
            logger.log(`Progress downloading articles [${dump.status.articles.success + dump.status.articles.fail}/${articlesTotal}] [${percentProgress}%]`)
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

  const jsConfigVarArticle = new ZimArticle({ url: jsPath('jsConfigVars', config.output.dirs.mediawiki), data: jsConfigVars, ns: '-' })
  zimCreator.addArticle(jsConfigVarArticle)

  return {
    jsModuleDependencies,
    cssModuleDependencies,
  }
}
