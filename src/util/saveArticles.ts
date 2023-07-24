import * as logger from '../Logger.js'
import Downloader from '../Downloader.js'
import MediaWiki from '../MediaWiki.js'
import { ZimArticle, ZimCreator } from '@openzim/libzim'
import htmlMinifier from 'html-minifier'
import * as QueryStringParser from 'querystring'

import pmap from 'p-map'
import DU from '../DOMUtils.js'
import * as domino from 'domino'
import { Dump } from '../Dump.js'
import Timer from './Timer.js'
import { contains, genCanonicalLink, genHeaderCSSLink, genHeaderScript, getFullUrl, getMediaBase, jsPath } from './index.js'
import { config } from '../config.js'
import { footerTemplate, htmlTemplateCode } from '../Templates.js'
import {
  getRelativeFilePath,
  getSizeFromUrl,
  encodeArticleIdForZimHtmlUrl,
  interpolateTranslationString,
  isWebpCandidateImageMimeType,
  getMimeType,
  cleanupAxiosError,
} from './misc.js'
import { rewriteUrlsOfDoc } from './rewriteUrls.js'
import { CONCURRENCY_LIMIT, DELETED_ARTICLE_ERROR, MAX_FILE_DOWNLOAD_RETRIES } from './const.js'

const genericJsModules = config.output.mw.js
const genericCssModules = config.output.mw.css

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
            logger.warn(`Error downloading file [${downloader.deserializeUrl(resp.url)}], skipping`)
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

async function getAllArticlesToKeep(downloader: Downloader, articleDetailXId: RKVS<ArticleDetail>, mw: MediaWiki, dump: Dump) {
  await articleDetailXId.iterateItems(downloader.speed, async (articleKeyValuePairs) => {
    for (const [articleId, articleDetail] of Object.entries(articleKeyValuePairs)) {
      try {
        const rets = await downloader.getArticle(articleId, dump, articleDetailXId, articleDetail)

        for (const { articleId, html: articleHtml } of rets) {
          if (!articleHtml) {
            continue
          }

          const doc = domino.createDocument(articleHtml)
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
  articleHtml: string,
  downloader: Downloader,
  redisStore: RS,
  mw: MediaWiki,
  dump: Dump,
  articleId: string,
  articleTitle: string,
  articleDetail: ArticleDetail,
  _moduleDependencies: any,
): Promise<Error> {
  try {
    const { finalHTML, mediaDependencies, subtitles } = await processArticleHtml(articleHtml, redisStore, mw, dump, articleId, articleDetail, _moduleDependencies, downloader.webp)

    const filesToDownload: KVS<FileDetail> = {}

    subtitles.forEach((s) => {
      filesToDownload[s.path] = { url: s.url, namespace: '-' }
    })

    if (mediaDependencies.length) {
      const existingVals = await redisStore.filesToDownloadXPath.getMany(mediaDependencies.map((dep) => dep.path))

      for (const dep of mediaDependencies) {
        const { mult, width } = getSizeFromUrl(dep.url)
        const existingVal = existingVals[dep.path]
        const currentDepIsHigherRes = !existingVal || existingVal.width < (width || 10e6) || existingVal.mult < (mult || 1)
        if (currentDepIsHigherRes) {
          filesToDownload[dep.path] = {
            url: downloader.serializeUrl(dep.url),
            mult,
            width,
          }
        }
      }
    }

    await redisStore.filesToDownloadXPath.setMany(filesToDownload)

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

/*
 * Fetch Articles
 */
export async function saveArticles(zimCreator: ZimCreator, downloader: Downloader, redisStore: RS, mw: MediaWiki, dump: Dump) {
  const jsModuleDependencies = new Set<string>()
  const cssModuleDependencies = new Set<string>()
  let jsConfigVars = ''
  let prevPercentProgress: string

  const { articleDetailXId } = redisStore
  const articlesTotal = await articleDetailXId.len()

  if (dump.customProcessor?.shouldKeepArticle) {
    await getAllArticlesToKeep(downloader, articleDetailXId, mw, dump)
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

        try {
          const rets = await downloader.getArticle(articleId, dump, articleDetailXId, articleDetail)

          for (const { articleId, displayTitle: articleTitle, html: articleHtml } of rets) {
            const nonPaginatedArticleId = articleDetail.title
            if (!articleHtml) {
              logger.warn(`No HTML returned for article [${articleId}], skipping`)
              continue
            }

            curStage += 1
            const _moduleDependencies = await getModuleDependencies(nonPaginatedArticleId, mw, downloader)
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
            promises.push([articleId, saveArticle(zimCreator, articleHtml, downloader, redisStore, mw, dump, articleId, articleTitle, articleDetail, _moduleDependencies)])
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

export async function getModuleDependencies(articleId: string, mw: MediaWiki, downloader: Downloader) {
  /* These vars will store the list of js and css dependencies for
    the article we are downloading. */
  let jsConfigVars = ''
  let jsDependenciesList: string[] = []
  let styleDependenciesList: string[] = []

  const articleApiUrl = mw.articleApiUrl(articleId)

  const articleData = await downloader.getJSON<any>(articleApiUrl)

  if (articleData.error) {
    const errorMessage = `Unable to retrieve js/css dependencies for article '${articleId}': ${articleData.error.code}`
    logger.error(errorMessage)

    /* If article is missing (for example because it just has been deleted) */
    if (articleData.error.code === 'missingtitle') {
      return { jsConfigVars, jsDependenciesList, styleDependenciesList }
    }

    /* Something went wrong in modules retrieval at app level (no HTTP error) */
    throw new Error(errorMessage)
  }

  const {
    parse: { modules, modulescripts, modulestyles, headhtml },
  } = articleData
  jsDependenciesList = genericJsModules.concat(modules, modulescripts).filter((a) => a)
  styleDependenciesList = [].concat(modules, modulestyles, genericCssModules).filter((a) => a)
  styleDependenciesList = styleDependenciesList.filter((oneStyleDep) => !contains(config.filters.blackListCssModules, oneStyleDep))

  logger.info(`Js dependencies of ${articleId} : ${jsDependenciesList}`)
  logger.info(`Css dependencies of ${articleId} : ${styleDependenciesList}`)

  // Saving, as a js module, the jsconfigvars that are set in the header of a wikipedia page
  // the script below extracts the config with a regex executed on the page header returned from the api
  const scriptTags = domino.createDocument(`${headhtml['*']}</body></html>`).getElementsByTagName('script')
  const regex = /mw\.config\.set\(\{.*?\}\);/gm
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < scriptTags.length; i += 1) {
    if (scriptTags[i].text.includes('mw.config.set')) {
      jsConfigVars = regex.exec(scriptTags[i].text)[0] || ''
      jsConfigVars = `(window.RLQ=window.RLQ||[]).push(function() {${jsConfigVars}});`
    } else if (scriptTags[i].text.includes('RLCONF') || scriptTags[i].text.includes('RLSTATE') || scriptTags[i].text.includes('RLPAGEMODULES')) {
      jsConfigVars = scriptTags[i].text
    }
  }

  jsConfigVars = jsConfigVars.replace('nosuchaction', 'view') // to replace the wgAction config that is set to 'nosuchaction' from api but should be 'view'

  return { jsConfigVars, jsDependenciesList, styleDependenciesList }
}

async function processArticleHtml(
  html: string,
  redisStore: RS,
  mw: MediaWiki,
  dump: Dump,
  articleId: string,
  articleDetail: ArticleDetail,
  _moduleDependencies: any,
  webp: boolean,
) {
  let mediaDependencies: Array<{ url: string; path: string }> = []
  let subtitles: Array<{ url: string; path: string }> = []
  let doc = domino.createDocument(html)

  const ruRet = await rewriteUrlsOfDoc(doc, articleId, redisStore, mw, dump)
  doc = ruRet.doc
  mediaDependencies = mediaDependencies.concat(
    ruRet.mediaDependencies
      .filter((a) => a)
      .map((url) => {
        const path = getMediaBase(url, false)
        return { url, path }
      }),
  )
  doc = applyOtherTreatments(doc, dump)

  const tmRet = await treatMedias(doc, mw, dump, articleId, webp, redisStore)
  doc = tmRet.doc

  mediaDependencies = mediaDependencies.concat(
    tmRet.mediaDependencies
      .filter((a) => a)
      .map((url) => {
        const path = getMediaBase(url, false)
        return { url, path }
      }),
  )

  subtitles = subtitles.concat(
    tmRet.subtitles
      .filter((a) => a)
      .map((url) => {
        const { title, lang } = QueryStringParser.parse(url) as { title: string; lang: string }
        const path = `${title}-${lang}.vtt`
        return { url, path }
      }),
  )

  if (!dump.isMainPage(articleId) && dump.customProcessor?.preProcessArticle) {
    doc = await dump.customProcessor.preProcessArticle(articleId, doc)
  }

  let templatedDoc = await templateArticle(doc, _moduleDependencies, mw, dump, articleId, articleDetail, redisStore.articleDetailXId)

  if (dump.customProcessor && dump.customProcessor.postProcessArticle) {
    templatedDoc = await dump.customProcessor.postProcessArticle(articleId, templatedDoc)
  }

  let outHtml = templatedDoc.documentElement.outerHTML

  if (dump.opts.minifyHtml) {
    outHtml = htmlMinifier.minify(outHtml, {
      removeComments: true,
      conservativeCollapse: true,
      collapseBooleanAttributes: true,
      removeRedundantAttributes: true,
      removeEmptyAttributes: true,
      minifyCSS: true,
    })
  }

  const finalHTML = '<!DOCTYPE html>\n' + outHtml

  return {
    finalHTML,
    mediaDependencies,
    subtitles,
  }
}

export async function treatVideo(
  mw: MediaWiki,
  dump: Dump,
  srcCache: KVS<boolean>,
  articleId: string,
  videoEl: DominoElement,
  webp: boolean,
): Promise<{ mediaDependencies: string[]; subtitles: string[] }> {
  /* Worth noting:
     - This function handles audio tags as well as video tags
     - Video tags are used for audio files too (as opposed to the audio tag)
     - When it's only audio, there will be a single OGG file
     - For video, we get multiple SOURCE tages with different resolutions */
  const mediaDependencies: string[] = []
  const subtitles: string[] = []

  /* Just delete video/audio element if the flavour requires it */
  if (dump.nopic || dump.novid || dump.nodet) {
    DU.deleteNode(videoEl)
    return { mediaDependencies, subtitles }
  }

  /* Firefox is not able to display correctly <video> nodes with a
     height < 40. In that case the controls are not displayed. */
  if (videoEl.getAttribute('height') && videoEl.getAttribute('height') < 40) {
    videoEl.setAttribute('height', '40')
  }

  /* Always show controls */
  videoEl.setAttribute('controls', '40')

  /* Choose best fiting resolution <source> video node */
  const videoSourceEls: any[] = Array.from(videoEl.children).filter((child: any) => child.tagName === 'SOURCE')
  const videoDisplayedWidth = Number(videoEl.getAttribute('width'))
  let bestWidthDiff = 424242
  let chosenVideoSourceEl: DominoElement
  videoSourceEls.forEach((videoSourceEl: DominoElement) => {
    // Ignore non-webm && non-audio sources
    const videoSourceType = videoSourceEl.getAttribute('type')
    if (!videoSourceEl.getAttribute('src').endsWith('.webm') && !videoSourceType.startsWith('audio')) {
      DU.deleteNode(videoSourceEl)
      return
    }

    // Handle audio content
    if (videoSourceType.startsWith('audio/ogg')) {
      chosenVideoSourceEl = videoSourceEl
      return
    } else if (videoSourceType.startsWith('audio')) {
      DU.deleteNode(videoSourceEl)
      return
    }

    // If undefined displayed width, then take the best <source> resolution
    const videoSourceElWidth = Number(videoSourceEl.getAttribute('data-file-width') || videoSourceEl.getAttribute('data-width') || 0)
    if (!videoDisplayedWidth) {
      const chosenVideoSourceElWidth = chosenVideoSourceEl ? chosenVideoSourceEl.getAttribute('data-file-width') || chosenVideoSourceEl.getAttribute('data-width') || 0 : 0
      if (videoSourceElWidth > chosenVideoSourceElWidth || (videoSourceElWidth === chosenVideoSourceElWidth && videoSourceEl.getAttribute('src').endsWith('.vp9.webm'))) {
        DU.deleteNode(chosenVideoSourceEl)
        chosenVideoSourceEl = videoSourceEl
        return
      }
    }

    // Otherwise, choose <source> with better (smaller) width diff
    else {
      const widthDiff = Number(videoSourceElWidth - videoDisplayedWidth)

      // If no source has been picked so far, just take this one
      if (!chosenVideoSourceEl) {
        chosenVideoSourceEl = videoSourceEl
        bestWidthDiff = widthDiff
        return
      }

      // Resolution of source is higher than displayed resolution
      else if (widthDiff >= 0) {
        if (bestWidthDiff < 0 || widthDiff < bestWidthDiff || (widthDiff === bestWidthDiff && videoSourceEl.getAttribute('src').endsWith('.vp9.webm'))) {
          DU.deleteNode(chosenVideoSourceEl)
          chosenVideoSourceEl = videoSourceEl
          bestWidthDiff = widthDiff
          return
        }
      }

      // Resolution of source is smaller than displayed resolution
      else {
        if (widthDiff > bestWidthDiff || (widthDiff === bestWidthDiff && videoSourceEl.getAttribute('src').endsWith('.vp9.webm'))) {
          DU.deleteNode(chosenVideoSourceEl)
          chosenVideoSourceEl = videoSourceEl
          bestWidthDiff = widthDiff
          return
        }
      }
    }

    // Delete all other nodes
    DU.deleteNode(videoSourceEl)
  })

  /* If no appropriate source video can be found, delete the video */
  if (!chosenVideoSourceEl) {
    logger.warn(`Unable to find an appropriate video/audio source for an media element in article '${articleId}'`)
    DU.deleteNode(videoEl)
    return { mediaDependencies, subtitles }
  }

  /* Remove useless 'resource' attribute */
  videoEl.removeAttribute('resource')

  /* Handle video poster */
  const posterUrl = videoEl.getAttribute('poster')
  if (posterUrl) {
    const videoPosterUrl = getFullUrl(posterUrl, mw.baseUrl)
    const newVideoPosterUrl = getRelativeFilePath(articleId, getMediaBase(videoPosterUrl, true), 'I')

    if (posterUrl) {
      videoEl.setAttribute('poster', isWebpCandidateImageMimeType(webp, getMimeType(newVideoPosterUrl)) ? newVideoPosterUrl + '.webp' : newVideoPosterUrl)
    }
    videoEl.removeAttribute('resource')

    if (!srcCache.hasOwnProperty(videoPosterUrl)) {
      srcCache[videoPosterUrl] = true
      mediaDependencies.push(videoPosterUrl)
    }
  }

  /* Download content, but avoid duplicate calls */
  const sourceUrl = getFullUrl(chosenVideoSourceEl.getAttribute('src'), mw.baseUrl)
  if (!srcCache.hasOwnProperty(sourceUrl)) {
    srcCache[sourceUrl] = true
    mediaDependencies.push(sourceUrl)
  }

  /* Set new URL for the video element */
  const fileBase = getMediaBase(sourceUrl, true)
  chosenVideoSourceEl.setAttribute('src', getRelativeFilePath(articleId, fileBase, 'I'))

  /* Scrape subtitle */
  for (const track of Array.from(videoEl.querySelectorAll('track'))) {
    subtitles.push(await treatSubtitle(track, mw, articleId))
  }

  return { mediaDependencies, subtitles }
}

export async function treatSubtitle(trackEle: DominoElement, mw: MediaWiki, articleId: string): Promise<string> {
  const subtitleSourceUrl = getFullUrl(trackEle.getAttribute('src'), mw.baseUrl)
  const { title, lang } = QueryStringParser.parse(subtitleSourceUrl) as { title: string; lang: string }
  // The source URL we get from Mediawiki article is in srt format, so we replace it to vtt which is standard subtitle trackformat for <track> src attribute.
  const vttFormatUrl = new URL(subtitleSourceUrl)
  vttFormatUrl.searchParams.set('trackformat', 'vtt')
  trackEle.setAttribute('src', `${getRelativeFilePath(articleId, title, '-')}-${lang}.vtt`)
  return vttFormatUrl.href
}

function shouldKeepImage(dump: Dump, img: DominoElement) {
  const imageNodeClass = img.getAttribute('class') || ''
  const src = img.getAttribute('src')
  return (
    (!dump.nopic || imageNodeClass.includes('mwe-math-fallback-image-inline') || img.getAttribute('typeof') === 'mw:Extension/math') && src && !src.includes('./Special:FilePath/')
  )
}

async function treatImage(
  mw: MediaWiki,
  dump: Dump,
  srcCache: KVS<boolean>,
  articleId: string,
  img: DominoElement,
  webp: boolean,
  redisStore: RS,
): Promise<{ mediaDependencies: string[] }> {
  const mediaDependencies: string[] = []

  if (!shouldKeepImage(dump, img)) {
    DU.deleteNode(img)
    return { mediaDependencies }
  }

  /* Remove image link */
  const linkNode = img.parentNode
  if (linkNode.tagName === 'A') {
    /* Check if the target is mirrored */
    const href = linkNode.getAttribute('href') || ''
    const title = mw.extractPageTitleFromHref(href)
    const keepLink = title && (await redisStore.articleDetailXId.exists(title))

    /* Under certain condition it seems that this is possible
     * to have parentNode == undefined, in this case this
     * seems preferable to remove the whole link+content than
     * keeping a wrong link. See for example this url
     * http://parsoid.wmflabs.org/ko/%EC%9D%B4%ED%9C%98%EC%86%8C */
    if (!keepLink) {
      if (linkNode.parentNode) {
        linkNode.parentNode.replaceChild(img, linkNode)
      } else {
        DU.deleteNode(img)
        return { mediaDependencies }
      }
    }
  }

  /* Rewrite image src attribute */
  const src = getFullUrl(img.getAttribute('src'), mw.baseUrl)
  let newSrc: string
  try {
    const resourceNamespace = 'I'
    const slashesInUrl = articleId.split('/').length - 1
    const upStr = '../'.repeat(slashesInUrl + 1)
    newSrc = `${upStr}${resourceNamespace}/` + getMediaBase(src, true)
    /* Download image, but avoid duplicate calls */
    if (!srcCache.hasOwnProperty(src)) {
      srcCache[src] = true
      mediaDependencies.push(src)
    }

    /* Change image source attribute to point to the local image */
    img.setAttribute('src', isWebpCandidateImageMimeType(webp, getMimeType(src)) ? newSrc + '.webp' : newSrc)

    /* Remove useless 'resource' attribute */
    img.removeAttribute('resource')

    /* Remove srcset */
    img.removeAttribute('srcset')
  } catch (err) {
    DU.deleteNode(img)
  }

  /* Add lazy loading */
  img.setAttribute('loading', 'lazy')

  return { mediaDependencies }
}

function isStillLinked(image: DominoElement) {
  return image && image.parentNode && image.parentNode.tagName === 'A'
}

function shouldKeepNode(dump: Dump, imageNode: DominoElement, image: DominoElement) {
  return !dump.nopic && imageNode && image
}

function makeThumbDiv(dump: Dump, parsoidDoc: DominoElement, imageNode: DominoElement) {
  const imageNodeClass = imageNode.getAttribute('class') || ''
  let thumbDiv = parsoidDoc.createElement('div')
  thumbDiv.setAttribute('class', 'thumb')
  if (imageNodeClass.search('mw-halign-right') >= 0) {
    DU.appendToAttr(thumbDiv, 'class', 'tright')
  } else if (imageNodeClass.search('mw-halign-left') >= 0) {
    DU.appendToAttr(thumbDiv, 'class', 'tleft')
  } else if (imageNodeClass.search('mw-halign-center') >= 0) {
    DU.appendToAttr(thumbDiv, 'class', 'tnone')
    const centerDiv = parsoidDoc.createElement('center')
    centerDiv.appendChild(thumbDiv)
    thumbDiv = centerDiv
  } else {
    const revAutoAlign = dump.mwMetaData.textDir === 'ltr' ? 'right' : 'left'
    DU.appendToAttr(thumbDiv, 'class', `t${revAutoAlign}`)
  }
  return thumbDiv
}

function treatImageFrames(mw: MediaWiki, dump: Dump, parsoidDoc: DominoElement, imageNode: DominoElement) {
  const image = imageNode.getElementsByTagName('img')[0] || imageNode.getElementsByTagName('video')[0]

  if (!shouldKeepNode(dump, imageNode, image)) {
    DU.deleteNode(imageNode)
    return
  }

  const descriptions = imageNode.getElementsByTagName('figcaption')
  const description = descriptions.length > 0 ? descriptions[0] : undefined
  const imageWidth = parseInt(image.getAttribute('width'), 10)

  const thumbDiv = makeThumbDiv(dump, parsoidDoc, imageNode)

  const thumbinnerDiv = parsoidDoc.createElement('div')
  thumbinnerDiv.setAttribute('class', 'thumbinner')
  thumbinnerDiv.setAttribute('style', `width:${imageWidth + 2}px`)

  const thumbcaptionDiv = parsoidDoc.createElement('div')
  thumbcaptionDiv.setAttribute('class', 'thumbcaption')
  const autoAlign = dump.mwMetaData.textDir === 'ltr' ? 'left' : 'right'
  thumbcaptionDiv.setAttribute('style', `text-align: ${autoAlign}`)
  if (description) {
    thumbcaptionDiv.innerHTML = description.innerHTML
  }

  thumbinnerDiv.appendChild(isStillLinked(image) ? image.parentNode : image)
  thumbinnerDiv.appendChild(thumbcaptionDiv)
  thumbDiv.appendChild(thumbinnerDiv)

  imageNode.parentNode.replaceChild(thumbDiv, imageNode)
}

export async function treatMedias(parsoidDoc: DominoElement, mw: MediaWiki, dump: Dump, articleId: string, webp: boolean, redisStore: RS) {
  let mediaDependencies: string[] = []
  let subtitles: string[] = []
  /* Clean/rewrite image tags */
  const imgs = Array.from(parsoidDoc.getElementsByTagName('img'))
  const videos: DominoElement = Array.from(parsoidDoc.querySelectorAll('video, audio'))
  const srcCache: KVS<boolean> = {}

  for (const videoEl of videos) {
    // <video /> and <audio />
    const ret = await treatVideo(mw, dump, srcCache, articleId, videoEl, webp)
    mediaDependencies = mediaDependencies.concat(ret.mediaDependencies)
    subtitles = subtitles.concat(ret.subtitles)
  }

  for (const imgEl of imgs) {
    const ret = await treatImage(mw, dump, srcCache, articleId, imgEl, webp, redisStore)
    mediaDependencies = mediaDependencies.concat(ret.mediaDependencies)
  }

  /* Improve image frames */
  const figures = parsoidDoc.getElementsByTagName('figure')
  const spans = parsoidDoc.querySelectorAll('span[typeof~=mw:Image/Frameless],span[typeof~=mw:File/Frameless]')
  const imageNodes = Array.prototype.slice.call(figures).concat(Array.prototype.slice.call(spans))
  for (const imageNode of imageNodes) {
    treatImageFrames(mw, dump, parsoidDoc, imageNode)
  }

  return { doc: parsoidDoc, mediaDependencies, subtitles }
}

export function applyOtherTreatments(parsoidDoc: DominoElement, dump: Dump) {
  const filtersConfig = config.filters

  /* Don't need <link> and <input> tags */
  const nodesToDelete: Array<{ class?: string; tag?: string; filter?: (n: any) => boolean }> = [{ tag: 'link' }, { tag: 'input' }]

  /* Remove "map" tags if necessary */
  if (dump.nopic) {
    nodesToDelete.push({ tag: 'map' })
  }

  /* Remove useless DOM nodes without children */
  function emptyChildFilter(n: any) {
    return !n.innerHTML
  }
  nodesToDelete.push({ tag: 'li', filter: emptyChildFilter })
  nodesToDelete.push({ tag: 'span', filter: emptyChildFilter })

  /* Remove gallery boxes if pics need stripping of if it doesn't have thumbs */
  nodesToDelete.push({
    class: 'gallerybox',
    filter(n) {
      return !n.getElementsByTagName('img').length && !n.getElementsByTagName('audio').length && !n.getElementsByTagName('video').length
    },
  })
  nodesToDelete.push({
    class: 'gallery',
    filter(n) {
      return !n.getElementsByClassName('gallerybox').length
    },
  })

  /* Remove element with black listed CSS classes */
  filtersConfig.cssClassBlackList.forEach((classname: string) => {
    nodesToDelete.push({ class: classname })
  })

  if (dump.nodet) {
    filtersConfig.nodetCssClassBlackList.forEach((classname: string) => {
      nodesToDelete.push({ class: classname })
    })
  }

  /* Remove element with black listed CSS classes and no link */
  filtersConfig.cssClassBlackListIfNoLink.forEach((classname: string) => {
    nodesToDelete.push({
      class: classname,
      filter(n) {
        return n.getElementsByTagName('a').length === 0
      },
    })
  })

  /* Delete them all */
  for (const t of nodesToDelete) {
    let nodes
    if (t.tag) {
      nodes = parsoidDoc.getElementsByTagName(t.tag)
    } else if (t.class) {
      nodes = parsoidDoc.getElementsByClassName(t.class)
    } else {
      return /* throw error? */
    }

    for (const node of Array.from(nodes)) {
      if (!t.filter || t.filter(node)) {
        DU.deleteNode(node)
      }
    }
  }

  /* Go through all reference calls */
  const spans: DominoElement[] = Array.from(parsoidDoc.getElementsByTagName('span'))
  for (const span of spans) {
    const rel = span.getAttribute('rel')
    if (rel === 'dc:references') {
      const sup = parsoidDoc.createElement('sup')
      if (span.innerHTML) {
        sup.id = span.id
        sup.innerHTML = span.innerHTML
        span.parentNode.replaceChild(sup, span)
      } else {
        DU.deleteNode(span)
      }
    }
  }

  /* Remove element with id in the blacklist */
  filtersConfig.idBlackList.forEach((id) => {
    const node = parsoidDoc.getElementById(id)
    if (node) {
      DU.deleteNode(node)
    }
  })

  /* Force display of element with that CSS class */
  filtersConfig.cssClassDisplayList.map((classname: string) => {
    const nodes: DominoElement[] = Array.from(parsoidDoc.getElementsByClassName(classname))
    for (const node of nodes) {
      node.style.removeProperty('display')
    }
  })

  /* Remove empty paragraphs */
  // TODO: This option should be applied for page/html or/and page/mobile-html endpoints
  if (!dump.opts.keepEmptyParagraphs) {
    // Mobile view === details
    // Desktop view === section
    const sections: DominoElement[] = Array.from(parsoidDoc.querySelectorAll('details, section'))
    for (const section of sections) {
      if (
        section.children.length ===
        Array.from(section.children).filter((child: DominoElement) => {
          return child.matches('summary')
        }).length
      ) {
        DU.deleteNode(section)
      }
    }
  }

  /* Clean the DOM of all uncessary code */
  const allNodes: DominoElement[] = Array.from(parsoidDoc.getElementsByTagName('*'))
  for (const node of allNodes) {
    node.removeAttribute('data-parsoid')
    node.removeAttribute('typeof')
    node.removeAttribute('about')
    node.removeAttribute('data-mw')

    if (node.getAttribute('rel') && node.getAttribute('rel').substr(0, 3) === 'mw:') {
      node.removeAttribute('rel')
    } else if (node.getAttribute('img')) {
      /* Remove a few images Parsoid attributes */
      node.removeAttribute('data-file-width')
      node.removeAttribute('data-file-height')
      node.removeAttribute('data-file-type')
    }

    /* Remove a few css calls */
    filtersConfig.cssClassCallsBlackList.map((classname: string) => {
      if (node.getAttribute('class')) {
        node.setAttribute('class', node.getAttribute('class').replace(classname, ''))
      }
    })
  }

  const kartographerMaplinkNodes = Array.from<DominoElement>(parsoidDoc.querySelectorAll('.mw-kartographer-maplink')).filter((n) => !!n.textContent)
  for (const node of kartographerMaplinkNodes) {
    node.textContent = '🌍'
  }

  return parsoidDoc
}

async function templateArticle(
  parsoidDoc: DominoElement,
  moduleDependencies: any,
  mw: MediaWiki,
  dump: Dump,
  articleId: string,
  articleDetail: ArticleDetail,
  articleDetailXId: RKVS<ArticleDetail>,
): Promise<Document> {
  const { jsConfigVars, jsDependenciesList, styleDependenciesList } = moduleDependencies as {
    jsConfigVars: string | RegExpExecArray
    jsDependenciesList: string[]
    styleDependenciesList: string[]
  }

  const htmlTemplateDoc = domino.createDocument(
    htmlTemplateCode(articleId)
      .replace('__ARTICLE_CANONICAL_LINK__', genCanonicalLink(config, mw.webUrl.href, articleId))
      .replace('__ARTICLE_CONFIGVARS_LIST__', jsConfigVars !== '' ? genHeaderScript(config, 'jsConfigVars', articleId, config.output.dirs.mediawiki) : '')
      .replace(
        '__ARTICLE_JS_LIST__',
        jsDependenciesList.length !== 0 ? jsDependenciesList.map((oneJsDep) => genHeaderScript(config, oneJsDep, articleId, config.output.dirs.mediawiki)).join('\n') : '',
      )
      .replace(
        '__ARTICLE_CSS_LIST__',
        styleDependenciesList.length !== 0 ? styleDependenciesList.map((oneCssDep) => genHeaderCSSLink(config, oneCssDep, articleId, config.output.dirs.mediawiki)).join('\n') : '',
      ),
  )

  /* Create final document by merging template and parsoid documents */
  htmlTemplateDoc.getElementById('mw-content-text').style.setProperty('direction', dump.mwMetaData.textDir)
  htmlTemplateDoc.getElementById('mw-content-text').innerHTML = parsoidDoc.getElementsByTagName('body')[0].innerHTML

  /* Title */
  htmlTemplateDoc.getElementsByTagName('title')[0].innerHTML = htmlTemplateDoc.getElementById('title_0')
    ? htmlTemplateDoc.getElementById('title_0').textContent
    : articleId.replace(/_/g, ' ')
  DU.deleteNode(htmlTemplateDoc.getElementById('titleHeading'))

  /* Subpage */
  if (isSubpage(articleId, mw) && !dump.isMainPage(articleId)) {
    const headingNode = htmlTemplateDoc.getElementById('mw-content-text')
    const subpagesNode = htmlTemplateDoc.createElement('span')
    const parents = articleId.split('/')
    parents.pop()
    let subpages = ''
    await Promise.all(
      parents.map(async (parent) => {
        const label = parent.replace(/_/g, ' ')
        const isParentMirrored = await articleDetailXId.exists(`${articleId.split(parent)[0]}${parent}`)
        subpages += `&lt; ${
          isParentMirrored ? `<a href="${'../'.repeat(parents.length)}${encodeArticleIdForZimHtmlUrl(`${articleId.split(parent)[0]}${parent}`)}" title="${label}">` : ''
        }${label}${isParentMirrored ? '</a> ' : ' '}`
      }),
    )
    subpagesNode.innerHTML = subpages
    subpagesNode.setAttribute('class', 'subpages')
    headingNode.parentNode.insertBefore(subpagesNode, headingNode)
  }

  /* Set footer */
  const div = htmlTemplateDoc.createElement('div')

  /* Revision date */
  const date = new Date(articleDetail.timestamp)
  const lastEditedOnString = date
    ? interpolateTranslationString(dump.strings.LAST_EDITED_ON, {
        date: date.toISOString().substring(0, 10),
      })
    : null

  const creatorLink =
    '<a class="external text" ' +
    `${lastEditedOnString ? `title="${lastEditedOnString}"` : ''} ` +
    `href="${mw.webUrl.href}?title=${encodeURIComponent(articleId)}&oldid=${articleDetail.revisionId}">` +
    `${dump.mwMetaData.creator}</a>`

  const licenseLink = `<a class="external text" href="https://creativecommons.org/licenses/by-sa/4.0/">${dump.strings.LICENSE_NAME}</a>`

  div.innerHTML = footerTemplate({
    disclaimer: interpolateTranslationString(dump.strings.DISCLAIMER, {
      creator: creatorLink,
      license: licenseLink,
    }),
    strings: dump.strings,
  })
  htmlTemplateDoc.getElementById('mw-content-text').appendChild(div)
  addNoIndexCommentToElement(div)

  /* Geo-coordinates */
  if (articleDetail.coordinates) {
    const geoCoordinates = articleDetail.coordinates
    const metaNode = htmlTemplateDoc.createElement('meta')
    metaNode.name = 'geo.position'
    metaNode.content = geoCoordinates
    htmlTemplateDoc.getElementsByTagName('head')[0].appendChild(metaNode)
  }

  return htmlTemplateDoc
}

function addNoIndexCommentToElement(element: DominoElement) {
  const slices = element.parentElement.innerHTML.split(element.outerHTML)
  element.parentElement.innerHTML = `${slices[0]}<!--htdig_noindex-->${element.outerHTML}<!--/htdig_noindex-->${slices[1]}`
}

function isSubpage(id: string, mw: MediaWiki) {
  if (id && id.indexOf('/') >= 0) {
    const namespace = id.indexOf(':') >= 0 ? id.substring(0, id.indexOf(':')) : ''
    const ns = mw.namespaces[namespace] // namespace already defined
    if (ns !== undefined) {
      return ns.allowedSubpages
    }
  }
  return false
}
