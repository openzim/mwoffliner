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
import { truncateZimEntryTitleWords } from './misc.js'
import { isMainPage } from './pages.js'

function getPageRenderUrl(pageDetail: PageDetail, dump: Dump): string {
  const leadSectionId = dump.nodet && !pageDetail.contentmodel && !pageDetail.missing ? config.filters.leadSectionId : ''
  const oldid = dump.opts.stableRevision && pageDetail.stableRevisionId !== undefined ? pageDetail.stableRevisionId : undefined
  return Downloader.getPageUrl(pageDetail.title, { sectionId: leadSectionId, oldid, langVar: dump.langVar })
}

async function getAllPagesToKeep(dump: Dump, pagesRenderer: Renderer) {
  await RedisStore.pagesStore.iterateItems(Downloader.workers, async (pageKeyValuePairs) => {
    for (const pageDetail of Object.values(pageKeyValuePairs)) {
      const pageTitle = pageDetail.title
      try {
        const mainPage = isMainPage(pageTitle)
        const pageUrl = getPageRenderUrl(pageDetail, dump)

        const rendererOutput = await Downloader.getPage(pageTitle, pagesRenderer, pageUrl, dump, pageDetail)
        await new Promise((resolve) => setTimeout(resolve, Downloader.pageRequestInterval))
        for (const { pageTitle, htmlContent } of rendererOutput.items) {
          if (!htmlContent) {
            continue
          }

          const doc = domino.createDocument(htmlContent)
          if (!mainPage && !(await dump.customProcessor.shouldKeepPage(pageTitle, doc))) {
            RedisStore.pagesStore.delete(pageTitle)
          }
        }
      } catch (err) {
        logger.warn(`Error downloading page [${pageTitle}], skipping`, err)
        RedisStore.pagesStore.delete(pageTitle)
      }
    }
  })
}

/*
 * Parse fetched page HTML, store files
 * and dependencies and save in Zim
 */
export async function savePage(zimCreator: Creator, htmlContent: string, zimPath: string, zimTitle: string): Promise<Error> {
  try {
    const zimPage = zimTitle
      ? new StringItem(zimPath, 'text/html', truncateZimEntryTitleWords(zimTitle), { FRONT_ARTICLE: 1 }, htmlContent)
      : new StringItem(zimPath, 'text/html', '', {}, htmlContent)
    await zimCreatorMutex.runExclusive(() => zimCreator.addItem(zimPage))

    return null
  } catch (err) {
    return err as Error
  }
}

async function savePageFiles(mediaDependencies: any, imageDependencies: any, videoDependencies: any, subtitles: any): Promise<Error> {
  try {
    const pageFiles: KVS<FileDetail> = {}

    if (subtitles?.length > 0) {
      subtitles.forEach((s) => {
        pageFiles[s.path] = { url: s.url, kind: 'subtitle' }
      })
    }

    if (mediaDependencies && mediaDependencies.length) {
      for (const dep of mediaDependencies) {
        const { mult, width } = getSizeFromUrl(dep.url)
        pageFiles[dep.path] = { url: urlHelper.serializeUrl(dep.url), kind: 'media', mult, width }
      }
    }

    if (imageDependencies && imageDependencies.length) {
      for (const dep of imageDependencies) {
        const urlSize = getSizeFromUrl(dep.url)
        const width = dep.width || urlSize.width
        const mult = urlSize.mult
        pageFiles[dep.path] = { url: urlHelper.serializeUrl(dep.url), kind: 'image', mult, width }
      }
    }

    if (videoDependencies && videoDependencies.length) {
      for (const dep of videoDependencies) {
        const { mult, width } = getSizeFromUrl(dep.url)
        pageFiles[dep.path] = { url: urlHelper.serializeUrl(dep.url), kind: 'video', mult, width }
      }
    }

    await FileManager.addManyFilesToProcess(pageFiles)

    return null
  } catch (err) {
    return err as Error
  }
}

/*
 * Fetch Pages content, rewrite and save in ZIM
 */
export async function savePages(zimCreator: Creator, dump: Dump) {
  const jsModuleDependencies = new Set<string>()
  const cssModuleDependencies = new Set<string>()
  let prevPercentProgress: string
  const pagesTotal = await RedisStore.pagesStore.len()

  // number of pages allowed to fail is the greater of 5 or 0.001% (1 per 100k) pages
  dump.maxHardFailedPages = Math.max(5, Math.floor(pagesTotal / 100000))

  if (dump.customProcessor?.shouldKeepPage) {
    await getAllPagesToKeep(dump, RenderingContext.pagesRenderer)
  }

  // depending on which renderer we use, we can have up to 2 requests to make to download page details
  // each request we need to make can be retried 10 times. Each retry attempttakes at most requestTimeout + retry interval
  // retry interval is an exponentional value from 1 to 60s
  // we assume rest of processing is "fast" and takes at most 1 minute
  const timeout = 2 * (Downloader.requestTimeout * 10 + (1 + 2 + 4 + 8 + 16 + 32 + 60 * 4) * 1000) + 60000
  await RedisStore.pagesStore.iterateItems(Downloader.workers, (pageKeyValuePairs, runningWorkers) => {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      /*
       * timer to detect freezes
       */
      let curPage = ''
      const timer = new Timer(() => {
        const errorMessage = `Worker timed out after ${timeout} ms at ${curPage}`
        logger.error(errorMessage)
        reject(new Error(errorMessage))
      }, timeout)

      logger.debug(`Worker processing batch of page ids [${logger.logifyArray(Object.keys(pageKeyValuePairs))}] - ${runningWorkers} worker(s) running`)

      for (const pageDetail of Object.values(pageKeyValuePairs)) {
        timer.reset()
        curPage = pageDetail.title

        if (dump.status.pages.success > 0 && (dump.status.pages.success + dump.status.pages.hardFail + dump.status.pages.softFail) % 10 === 0) {
          const percentProgress = (((dump.status.pages.success + dump.status.pages.hardFail + dump.status.pages.softFail) / pagesTotal) * 100).toFixed(1)
          if (percentProgress !== prevPercentProgress) {
            prevPercentProgress = percentProgress
            logger.info(`Progress downloading pages [${dump.status.pages.success + dump.status.pages.hardFail + dump.status.pages.softFail}/${pagesTotal}] [${percentProgress}%]`)
          }
        }

        try {
          const pageUrl = getPageRenderUrl(pageDetail, dump)

          const { items, moduleDependencies, mediaDependencies, imageDependencies, videoDependencies, subtitles, needsDownloadErrorStaticFiles } = await Downloader.getPage(
            pageDetail.title,
            RenderingContext.pagesRenderer,
            pageUrl,
            dump,
            pageDetail,
          )
          await new Promise((resolve) => setTimeout(resolve, Downloader.pageRequestInterval))

          if (items.length == 0) {
            logger.warn(`No HTML items returned for page [${pageDetail.title}], skipping`)
            continue
          }

          if (needsDownloadErrorStaticFiles) {
            RenderingContext.pagesRenderer.addDownloadErrorStaticFiles()
          }

          for (const dep of moduleDependencies.jsDependenciesList || []) {
            jsModuleDependencies.add(dep)
          }
          for (const dep of moduleDependencies.styleDependenciesList || []) {
            cssModuleDependencies.add(dep)
          }

          savePageFiles(mediaDependencies, imageDependencies, videoDependencies, subtitles)

          for (const { pageTitle, htmlContent, zimPath, zimTitle } of items) {
            if (!htmlContent) {
              logger.warn(`No HTML content returned for page [${pageTitle}] path [${zimPath}], skipping`)
              continue
            }
            savePage(zimCreator, htmlContent, zimPath, zimTitle)
          }

          dump.status.pages.success += 1
        } catch (err) {
          logger.error(`Error downloading/rendering page ${curPage}`)
          reject(err)
          return
        }
      }

      timer.clear()
      resolve()
    })
  })

  logger.info(`Done with downloading a total of [${pagesTotal}] pages`)

  return {
    staticFilesList: RenderingContext.pagesRenderer.getStaticFilesList(),
    jsModuleDependencies,
    cssModuleDependencies,
  }
}
