import * as logger from '../Logger.js'
import Downloader from '../Downloader.js'
import MediaWiki from '../MediaWiki.js'
import { ZimArticle, ZimCreator } from '@openzim/libzim'

import pmap from 'p-map'
import DU from '../DOMUtils.js'
import * as domino from 'domino'
import { Dump } from '../Dump.js'
import Timer from './Timer.js'
import { contains, jsPath } from './index.js'
import { config } from '../config.js'
import { getSizeFromUrl, cleanupAxiosError } from './misc.js'
import { CONCURRENCY_LIMIT, DELETED_ARTICLE_ERROR, MAX_FILE_DOWNLOAD_RETRIES } from './const.js'
import ApiURLDirector from './builders/url/api.director.js'
import articleTreatment from './treatments/article.treatment.js'
import urlHelper from './url.helper.js'
import { RendererBuilder } from './renderers/renderer.builder.js'

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

async function getAllArticlesToKeep(downloader: Downloader, articleDetailXId: RKVS<ArticleDetail>, mw: MediaWiki, dump: Dump, desktopRenderer, visualEditorRenderer) {
  await articleDetailXId.iterateItems(downloader.speed, async (articleKeyValuePairs) => {
    for (const [articleId, articleDetail] of Object.entries(articleKeyValuePairs)) {
      try {
        const articleRenderer = chooseRenderer(articleId, dump, downloader, desktopRenderer, visualEditorRenderer)
        const articleUrl = getArticleUrl(downloader, dump, articleId)
        const rets = await downloader.getArticle(articleId, articleDetailXId, articleRenderer, articleUrl, articleDetail)
        for (const { articleId, html: articleHtml } of rets) {
          if (!articleHtml) {
            continue
          }

          const doc = domino.createDocument(articleHtml)
          if (!isMainPage(dump, articleId) && !(await dump.customProcessor.shouldKeepArticle(articleId, doc))) {
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
    const { finalHTML, mediaDependencies, subtitles } = await articleTreatment.processArticleHtml(
      articleHtml,
      redisStore,
      mw,
      dump,
      articleId,
      articleDetail,
      _moduleDependencies,
      downloader.webp,
    )

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
            url: urlHelper.serializeUrl(dep.url),
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

function getArticleUrl(downloader: Downloader, dump: Dump, articleId: string): string {
  return `${isMainPage(dump, articleId) ? downloader.baseUrlForMainPage : downloader.baseUrl}${encodeURIComponent(articleId)}`
}

function isMainPage(dump: Dump, articleId: string): boolean {
  return dump.isMainPage(articleId)
}

function chooseRenderer(articleId, dump, downloader, desktopRenderer, visualEditorRenderer) {
  if (isMainPage(dump, articleId) || (downloader.mwCapabilities.veApiAvailable && !downloader.mwCapabilities.desktopRestApiAvailable)) {
    return visualEditorRenderer
  }
  return desktopRenderer
}

/*
 * Fetch Articles
 */
export async function saveArticles(zimCreator: ZimCreator, downloader: Downloader, redisStore: RS, mw: MediaWiki, dump: Dump) {
  const jsModuleDependencies = new Set<string>()
  const cssModuleDependencies = new Set<string>()
  let jsConfigVars = ''
  let prevPercentProgress: string
  const desktopRenderer = new RendererBuilder('desktop')
  const visualEditorRenderer = new RendererBuilder('visual-editor')
  const { articleDetailXId } = redisStore
  const articlesTotal = await articleDetailXId.len()

  if (dump.customProcessor?.shouldKeepArticle) {
    await getAllArticlesToKeep(downloader, articleDetailXId, mw, dump, desktopRenderer, visualEditorRenderer)
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

        let rets: any
        try {
          const articleRenderer = chooseRenderer(articleId, dump, downloader, desktopRenderer, visualEditorRenderer)
          const articleUrl = getArticleUrl(downloader, dump, articleId)
          rets = await downloader.getArticle(articleId, articleDetailXId, articleRenderer, articleUrl, articleDetail)

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

export async function getModuleDependencies(articleId: string, mw: MediaWiki, downloader: Downloader) {
  /* These vars will store the list of js and css dependencies for
    the article we are downloading. */
  let jsConfigVars = ''
  let jsDependenciesList: string[] = []
  let styleDependenciesList: string[] = []

  const apiUrlDirector = new ApiURLDirector(mw.apiUrl.href)

  const articleApiUrl = apiUrlDirector.buildArticleApiURL(articleId)

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
  // TODO: Refactor this option to work with page/html and page/mobile-html output. See issues/1866
  if (!dump.opts.keepEmptyParagraphs) {
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
