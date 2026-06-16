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

function getArticleRenderUrl(articleId: string, articleDetail: ArticleDetail, dump: Dump): string {
  const leadSectionId = dump.nodet && !articleDetail.contentmodel && !articleDetail.missing ? config.filters.leadSectionId : ''
  const oldid = dump.opts.stableRevision && articleDetail.stableRevisionId !== undefined ? articleDetail.stableRevisionId : undefined
  return Downloader.getArticleUrl(articleId, { sectionId: leadSectionId, oldid, langVar: dump.langVar })
}

async function getAllArticlesToKeep(articleDetailXId: RKVS<ArticleDetail>, dump: Dump, articlesRenderer: Renderer) {
  await articleDetailXId.iterateItems(Downloader.workers, async (articleKeyValuePairs) => {
    for (const [articleId, articleDetail] of Object.entries(articleKeyValuePairs)) {
      try {
        const mainPage = isMainPage(articleId)
        const articleUrl = getArticleRenderUrl(articleId, articleDetail, dump)

        const rendererOutput = await Downloader.getArticle(articleId, articleDetailXId, articlesRenderer, articleUrl, dump, articleDetail)
        await new Promise((resolve) => setTimeout(resolve, Downloader.articleRequestInterval))
        for (const { articleId, htmlContent } of rendererOutput.items) {
          if (!htmlContent) {
            continue
          }

          const doc = domino.createDocument(htmlContent)
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

/*
 * Parse fetched article HTML, store files
 * and dependencies and save in Zim
 */
async function saveArticle(zimCreator: Creator, htmlContent: string, zimPath: string, zimTitle: string): Promise<Error> {
  try {
    const zimArticle = zimTitle
      ? new StringItem(zimPath, 'text/html', truncateUtf8Bytes(zimTitle, 245), { FRONT_ARTICLE: 1 }, htmlContent)
      : new StringItem(zimPath, 'text/html', '', {}, htmlContent)
    await zimCreatorMutex.runExclusive(() => zimCreator.addItem(zimArticle))

    return null
  } catch (err) {
    return err as Error
  }
}

async function saveArticleFiles(mediaDependencies: any, imageDependencies: any, videoDependencies: any, subtitles: any): Promise<Error> {
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

    return null
  } catch (err) {
    return err as Error
  }
}

/*
 * Fetch Articles
 */
export async function saveArticles(zimCreator: Creator, dump: Dump) {
  const jsModuleDependencies = new Set<string>()
  const cssModuleDependencies = new Set<string>()
  let prevPercentProgress: string
  const { articleDetailXId } = RedisStore
  const articlesTotal = await articleDetailXId.len()

  // number of articles allowed to fail is the greater of 5 or 0.001% (1 per 100k) articles
  dump.maxHardFailedArticles = Math.max(5, Math.floor(articlesTotal / 100000))

  if (dump.customProcessor?.shouldKeepArticle) {
    await getAllArticlesToKeep(articleDetailXId, dump, RenderingContext.articlesRenderer)
  }

  // depending on which renderer we use, we can have up to 2 requests to make to download article details
  // each request we need to make can be retried 10 times. Each retry attempttakes at most requestTimeout + retry interval
  // retry interval is an exponentional value from 1 to 60s
  // we assume rest of processing is "fast" and takes at most 1 minute
  const timeout = 2 * (Downloader.requestTimeout * 10 + (1 + 2 + 4 + 8 + 16 + 32 + 60 * 4) * 1000) + 60000
  await articleDetailXId.iterateItems(Downloader.workers, (articleKeyValuePairs, runningWorkers) => {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      /*
       * timer to detect freezes
       */
      let curArticle = ''
      const timer = new Timer(() => {
        const errorMessage = `Worker timed out after ${timeout} ms at ${curArticle}`
        logger.error(errorMessage)
        reject(new Error(errorMessage))
      }, timeout)

      logger.debug(`Worker processing batch of article ids [${logger.logifyArray(Object.keys(articleKeyValuePairs))}] - ${runningWorkers} worker(s) running`)

      for (const [articleId, articleDetail] of Object.entries(articleKeyValuePairs)) {
        timer.reset()
        curArticle = articleId

        if (dump.status.articles.success > 0 && (dump.status.articles.success + dump.status.articles.hardFail + dump.status.articles.softFail) % 10 === 0) {
          const percentProgress = (((dump.status.articles.success + dump.status.articles.hardFail + dump.status.articles.softFail) / articlesTotal) * 100).toFixed(1)
          if (percentProgress !== prevPercentProgress) {
            prevPercentProgress = percentProgress
            logger.info(
              `Progress downloading articles [${
                dump.status.articles.success + dump.status.articles.hardFail + dump.status.articles.softFail
              }/${articlesTotal}] [${percentProgress}%]`,
            )
          }
        }

        try {
          const articleUrl = getArticleRenderUrl(articleId, articleDetail, dump)

          const { items, moduleDependencies, mediaDependencies, imageDependencies, videoDependencies, subtitles, needsDownloadErrorStaticFiles } = await Downloader.getArticle(
            articleId,
            articleDetailXId,
            RenderingContext.articlesRenderer,
            articleUrl,
            dump,
            articleDetail,
          )
          await new Promise((resolve) => setTimeout(resolve, Downloader.articleRequestInterval))

          if (items.length == 0) {
            logger.warn(`No HTML items returned for article [${articleId}], skipping`)
            continue
          }

          if (needsDownloadErrorStaticFiles) {
            RenderingContext.articlesRenderer.addDownloadErrorStaticFiles()
          }

          for (const dep of moduleDependencies.jsDependenciesList || []) {
            jsModuleDependencies.add(dep)
          }
          for (const dep of moduleDependencies.styleDependenciesList || []) {
            cssModuleDependencies.add(dep)
          }

          saveArticleFiles(mediaDependencies, imageDependencies, videoDependencies, subtitles)

          for (const { htmlContent, zimPath, zimTitle } of items) {
            if (!htmlContent) {
              logger.warn(`No HTML content returned for article [${articleId}] path [${zimPath}], skipping`)
              continue
            }
            saveArticle(zimCreator, htmlContent, zimPath, zimTitle)
          }

          dump.status.articles.success += 1
        } catch (err) {
          logger.error(`Error downloading/rendering article ${articleId}`)
          reject(err)
          return
        }
      }

      timer.clear()
      resolve()
    })
  })

  logger.info(`Done with downloading a total of [${articlesTotal}] articles`)

  return {
    staticFilesList: RenderingContext.articlesRenderer.getStaticFilesList(),
    jsModuleDependencies,
    cssModuleDependencies,
  }
}
