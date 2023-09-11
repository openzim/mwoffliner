// tslint:disable-next-line: no-reference
/// <reference path="./types.d.ts" />

/* ********************************** */
/* MODULE VARIABLE SECTION ********** */
/* ********************************** */

import fs, { readFileSync } from 'fs'
import os from 'os'
import pmap from 'p-map'
import axios from 'axios'
import sharp from 'sharp'
import domino from 'domino'
import rimraf from 'rimraf'
import urlParser from 'url'
import semver from 'semver'
import * as path from 'path'
import * as QueryStringParser from 'querystring'
import { ZimArticle, ZimCreator } from '@openzim/libzim'
import { checkApiAvailability } from './util/mw-api.js'

import {
  MAX_CPU_CORES,
  MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE,
  downloadAndSaveModule,
  genCanonicalLink,
  genHeaderCSSLink,
  genHeaderScript,
  getAndProcessStylesheets,
  getDumps,
  getMediaBase,
  getRelativeFilePath,
  getSizeFromUrl,
  isValidEmail,
  makeArticleImageTile,
  makeArticleListItem,
  mkdirPromise,
  sanitizeString,
  saveStaticFiles,
  importPolyfillModules,
  extractArticleList,
  getTmpDirectory,
  validateMetadata,
} from './util/index.js'
import S3 from './S3.js'
import RedisStore from './RedisStore.js'
import * as logger from './Logger.js'
import { Dump } from './Dump.js'
import { config } from './config.js'
import MediaWiki from './MediaWiki.js'
import Downloader from './Downloader.js'
import { getArticleIds } from './util/mw-api.js'
import { articleListHomeTemplate } from './Templates.js'
import { downloadFiles, saveArticles } from './util/saveArticles.js'
import { getCategoriesForArticles, trimUnmirroredPages } from './util/categories.js'
import { fileURLToPath } from 'url'
import ApiURLDirector from './util/builders/url/api.director.js'
import urlHelper from './util/url.helper.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const packageJSON = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8'))

async function execute(argv: any) {
  /* ********************************* */
  /* CUSTOM VARIABLE SECTION ********* */
  /* ********************************* */

  const {
    speed: _speed,
    adminEmail,
    verbose,
    minifyHtml,
    keepEmptyParagraphs,
    mwUrl,
    mwWikiPath,
    mwApiPath,
    mwRestApiPath,
    mwModulePath,
    mwDomain,
    mwUsername,
    mwPassword,
    requestTimeout,
    customMainPage,
    customZimTitle,
    customZimDescription,
    customZimLongDescription,
    customZimTags,
    customZimLanguage,
    withoutZimFullTextIndex,
    webp,
    format,
    filenamePrefix,
    resume,
    publisher: _publisher,
    outputDirectory: _outputDirectory,
    addNamespaces: _addNamespaces,
    customZimFavicon,
    optimisationCacheUrl,
    customFlavour,
    forceRender,
  } = argv

  let { articleList, articleListToIgnore } = argv

  if (verbose) logger.setVerboseLevel(verbose)

  logger.log(`Starting mwoffliner v${packageJSON.version}...`)

  // TODO: Move it to sanitaze method
  if (articleList) articleList = String(articleList)
  if (articleListToIgnore) articleListToIgnore = String(articleListToIgnore)
  const publisher = _publisher || config.defaults.publisher

  // TODO: Move it to sanitaze method
  /* HTTP user-agent string */
  // const adminEmail = argv.adminEmail;
  if (!isValidEmail(adminEmail)) {
    throw new Error(`Admin email [${adminEmail}] is not valid`)
  }

  // TODO: Move it to sanitaze method
  /* Number of parallel requests. To secure stability and avoid HTTP
  429 errors, no more than MAX_CPU_CORES can be considered */
  if (_speed && isNaN(_speed)) {
    throw new Error('speed is not a number, please give a number value to --speed')
  }
  const cpuCount = Math.min(os.cpus().length, MAX_CPU_CORES)
  const speed = Math.max(1, Math.round(cpuCount * (_speed || 1)))

  /* Check Node.js version */
  const nodeVersionSatisfiesPackage = semver.satisfies(process.version, packageJSON.engines.node)
  if (!nodeVersionSatisfiesPackage) {
    logger.warn(`***********\n\n\tCurrent node version is [${process.version}]. We recommend [${packageJSON.engines.node}]\n\n***********`)
  }

  /* Instanciate custom flavour module */
  logger.info(`Using custom flavour: ${customFlavour || 'no'}`)
  const customProcessor = customFlavour ? new (await import(customFlavour))() : null

  let s3Obj
  // Check for S3 creds
  if (optimisationCacheUrl) {
    // Decompose the url with path and other S3 creds
    const s3UrlObj = urlParser.parse(optimisationCacheUrl)
    const queryReader = QueryStringParser.parse(s3UrlObj.query)
    const s3Url = (s3UrlObj.protocol || 'https:') + '//' + (s3UrlObj.host || '') + (s3UrlObj.pathname || '')
    s3Obj = new S3(s3Url, queryReader)
    await s3Obj.initialise().then(() => {
      logger.log('Successfully logged in S3')
    })
  }

  // Extract S3 obj to pass to downloader class
  const s3 = s3Obj ? s3Obj : {}

  /* Wikipedia/... URL; Normalize by adding trailing / as necessary */
  MediaWiki.base = mwUrl
  MediaWiki.getCategories = !!argv.getCategories
  MediaWiki.apiPath = mwApiPath
  MediaWiki.restApiPath = mwRestApiPath
  MediaWiki.modulePathOpt = mwModulePath
  MediaWiki.domain = mwDomain
  MediaWiki.password = mwPassword
  MediaWiki.username = mwUsername
  MediaWiki.wikiPath = mwWikiPath

  /* Download helpers; TODO: Merge with something else / expand this. */
  const downloader = new Downloader({
    uaString: `${config.userAgent} (${adminEmail})`,
    speed,
    reqTimeout: requestTimeout * 1000 || config.defaults.requestTimeout,
    optimisationCacheUrl,
    s3,
    webp,
  })

  /* perform login */
  await MediaWiki.login(downloader)

  /* Get MediaWiki Info */
  let mwMetaData
  try {
    mwMetaData = await MediaWiki.getMwMetaData(downloader)
  } catch (err) {
    logger.error('FATAL - Failed to get MediaWiki Metadata')
    throw err
  }

  const metaDataRequiredKeys = {
    Creator: mwMetaData.creator,
    Description: customZimDescription || mwMetaData.subTitle,
    Language: customZimLanguage || mwMetaData.langIso3,
    Publisher: publisher,
    Title: customZimTitle || mwMetaData.title,
    'Illustration_48x48@1': await getIllustrationMetadata(),
  }
  validateMetadata(metaDataRequiredKeys)

  // Sanitizing main page
  let mainPage = articleList ? '' : mwMetaData.mainPage

  if (customMainPage) {
    mainPage = customMainPage
    const mainPageUrl = MediaWiki.webUrl + encodeURIComponent(mainPage)
    if (!(await checkApiAvailability(mainPageUrl))) {
      throw new Error(`customMainPage doesn't return 200 status code for url ${mainPageUrl}`)
    }
  }

  MediaWiki.apiCheckArticleId = mwMetaData.mainPage
  await MediaWiki.hasCoordinates(downloader)
  await MediaWiki.hasWikimediaDesktopRestApi()
  await MediaWiki.hasWikimediaMobileRestApi()
  await MediaWiki.hasVisualEditorApi()
  await downloader.setBaseUrls(forceRender)

  RedisStore.setOptions(argv.redis || config.defaults.redisPath)
  await RedisStore.connect()
  const { articleDetailXId, filesToDownloadXPath, filesToRetryXPath, redirectsXId } = RedisStore

  // Output directory
  const outputDirectory = path.isAbsolute(_outputDirectory || '') ? _outputDirectory : path.join(process.cwd(), _outputDirectory || 'out')
  await mkdirPromise(outputDirectory)
  logger.log(`Using output directory ${outputDirectory}`)

  // Temporary directory
  const tmpDirectory = await getTmpDirectory()
  logger.log(`Using temporary directory ${tmpDirectory}`)

  process.on('exit', async (code) => {
    logger.log(`Exiting with code [${code}]`)
    logger.log(`Deleting temporary directory [${tmpDirectory}]`)
    rimraf.sync(tmpDirectory)
  })

  process.on('SIGTERM', async () => {
    logger.log('SIGTERM')
    await RedisStore.close()
    process.exit(128 + 15)
  })
  process.on('SIGINT', async () => {
    logger.log('SIGINT')
    await RedisStore.close()
    process.exit(128 + 2)
  })

  /* *********************************** */
  /*       SYSTEM VARIABLE SECTION       */
  /* *********************************** */

  const dumpFormats = getDumps(format)

  const addNamespaces = _addNamespaces
    ? String(_addNamespaces)
        .split(',')
        .map((a: string) => Number(a))
    : []

  /* ********************************* */
  /* GET CONTENT ********************* */
  /* ********************************* */

  let articleListToIgnoreLines: string[]
  if (articleListToIgnore) {
    try {
      articleListToIgnoreLines = await extractArticleList(articleListToIgnore)
      logger.info(`ArticleListToIgnore has [${articleListToIgnoreLines.length}] items`)
    } catch (err) {
      logger.error(`Failed to read articleListToIgnore from [${articleListToIgnore}]`, err)
      throw err
    }
  }

  let articleListLines: string[]
  if (articleList) {
    try {
      articleListLines = await extractArticleList(articleList)
      if (articleListToIgnore) {
        articleListLines = articleListLines.filter((title: string) => !articleListToIgnoreLines.includes(title))
      }
      logger.info(`ArticleList has [${articleListLines.length}] items`)
    } catch (err) {
      logger.error(`Failed to read articleList from [${articleList}]`, err)
      throw err
    }
  }

  await MediaWiki.getNamespaces(addNamespaces, downloader)

  logger.info('Getting article ids')
  let stime = Date.now()
  await getArticleIds(downloader, mainPage, articleList ? articleListLines : null, articleListToIgnore ? articleListToIgnoreLines : null)
  logger.log(`Got ArticleIDs in ${(Date.now() - stime) / 1000} seconds`)

  if (MediaWiki.getCategories) {
    await getCategoriesForArticles(articleDetailXId, downloader)

    while ((await trimUnmirroredPages(downloader)) > 0) {
      // Remove unmirrored pages, categories, subCategories
      // trimUnmirroredPages returns number of modified articles
    }

    // while ((await simplifyGraph(downloader, redisStore)).deletedNodes !== 0) {
    //   // keep simplifying graph
    // }
    // await trimUnmirroredPages(downloader); // TODO: improve simplify graph to remove the need for a second trim
  }

  const filenameDate = new Date().toISOString().slice(0, 7)

  // Getting total number of articles from Redis
  logger.log(`Total articles found in Redis: ${await articleDetailXId.len()}`)

  const dumps: Dump[] = []

  for (const dumpFormat of dumpFormats) {
    const dump = new Dump(
      dumpFormat,
      {
        tmpDir: tmpDirectory,
        username: mwUsername,
        password: mwPassword,
        outputDirectory,
        mainPage,
        filenamePrefix,
        articleList,
        publisher,
        customZimDescription,
        customZimLongDescription,
        customZimTags,
        customZimTitle,
        customZimLanguage,
        withoutZimFullTextIndex,
        resume,
        minifyHtml,
        keepEmptyParagraphs,
        tags: customZimTags,
        filenameDate,
      },
      { ...mwMetaData, mainPage },
      customProcessor,
    )
    dumps.push(dump)
    logger.log('Doing dump')
    let shouldSkip = false
    try {
      dump.checkResume()
    } catch (err) {
      shouldSkip = true
    }

    if (shouldSkip) {
      logger.log('Skipping dump')
    } else {
      try {
        await doDump(dump)
        await filesToDownloadXPath.flush()
      } catch (err) {
        debugger
        throw err
      }
      logger.log('Finished dump')
    }
  }

  logger.log('Closing HTTP agents...')

  logger.log('All dumping(s) finished with success.')

  async function doDump(dump: Dump) {
    const outZim = path.resolve(dump.opts.outputDirectory, dump.computeFilenameRadical() + '.zim')
    logger.log(`Writing zim to [${outZim}]`)
    dump.outFile = outZim

    const metadata = {
      ...metaDataRequiredKeys,
      Tags: dump.computeZimTags(),
      Name: dump.computeFilenameRadical(false, true, true),
      Flavour: dump.computeFlavour(),
      ...(dump.opts.customZimLongDescription ? { LongDescription: `${dump.opts.customZimLongDescription}` } : {}),
    }
    validateMetadata(metadata)

    const zimCreator = new ZimCreator(
      {
        fileName: outZim,
        fullTextIndexLanguage: dump.opts.withoutZimFullTextIndex ? '' : dump.mwMetaData.langIso3,
        welcome: dump.opts.mainPage ? dump.opts.mainPage : 'index',
        compression: 'zstd',
      },
      metadata as any,
    )
    const scraperArticle = new ZimArticle({
      ns: 'M',
      data: `mwoffliner ${packageJSON.version}`,
      url: 'Scraper',
    })
    zimCreator.addArticle(scraperArticle)

    logger.info('Copying Static Resource Files')
    await saveStaticFiles(config, zimCreator)

    logger.info('Finding stylesheets to download')
    const stylesheetsToGet = await dump.getRelevantStylesheetUrls(downloader)
    logger.log(`Found [${stylesheetsToGet.length}] stylesheets to download`)

    logger.log('Downloading stylesheets and populating media queue')
    const { finalCss } = await getAndProcessStylesheets(downloader, stylesheetsToGet)
    logger.log('Downloaded stylesheets')

    const article = new ZimArticle({ url: `${config.output.dirs.mediawiki}/style.css`, data: finalCss, ns: '-' })
    zimCreator.addArticle(article)
    await saveFavicon(zimCreator, metaDataRequiredKeys['Illustration_48x48@1'])

    await getThumbnailsData()

    logger.log('Getting Main Page')
    await getMainPage(dump, zimCreator, downloader)

    logger.log('Getting articles')
    stime = Date.now()
    const { jsModuleDependencies, cssModuleDependencies } = await saveArticles(zimCreator, downloader, dump, forceRender)
    logger.log(`Fetching Articles finished in ${(Date.now() - stime) / 1000} seconds`)

    logger.log(`Found [${jsModuleDependencies.size}] js module dependencies`)
    logger.log(`Found [${cssModuleDependencies.size}] style module dependencies`)

    const allDependenciesWithType = [
      { type: 'js', moduleList: Array.from(jsModuleDependencies) },
      { type: 'css', moduleList: Array.from(cssModuleDependencies) },
    ]

    if (downloader.webp) {
      logger.log('Downloading polyfill module')
      importPolyfillModules(zimCreator)
    }

    logger.log('Downloading module dependencies')
    await Promise.all(
      allDependenciesWithType.map(({ type, moduleList }) => {
        return pmap(
          moduleList,
          (oneModule) => {
            return downloadAndSaveModule(zimCreator, downloader, dump, oneModule, type as any)
          },
          { concurrency: downloader.speed },
        )
      }),
    )

    await downloadFiles(filesToDownloadXPath, filesToRetryXPath, zimCreator, dump, downloader)

    logger.log('Writing Article Redirects')
    await writeArticleRedirects(downloader, dump, zimCreator)

    logger.log('Finishing Zim Creation')
    await zimCreator.finalise()

    logger.log('Summary of scrape actions:', JSON.stringify(dump.status, null, '\t'))
  }

  /* ********************************* */
  /* FUNCTIONS *********************** */
  /* ********************************* */

  async function writeArticleRedirects(downloader: Downloader, dump: Dump, zimCreator: ZimCreator) {
    await redirectsXId.iterateItems(downloader.speed, async (redirects) => {
      for (const [redirectId, { targetId }] of Object.entries(redirects)) {
        if (redirectId !== targetId) {
          const redirectArticle = new ZimArticle({
            url: redirectId,
            shouldIndex: true,
            data: '',
            ns: 'A',
            mimeType: 'text/html',

            // We fake a title, by just removing the underscores
            title: String(redirectId).replace(/_/g, ' '),

            redirectUrl: targetId,
          })
          zimCreator.addArticle(redirectArticle)
          dump.status.redirects.written += 1
        }
      }
    })
  }

  async function getIllustrationMetadata(): Promise<Buffer> {
    if (customZimFavicon) {
      const faviconIsRemote = customZimFavicon.includes('http')
      let content
      if (faviconIsRemote) {
        logger.log(`Downloading remote zim favicon from [${customZimFavicon}]`)
        content = await axios
          .get(customZimFavicon, downloader.arrayBufferRequestOptions)
          .then((a) => a.data)
          .catch(() => {
            throw new Error(`Failed to download custom zim favicon from [${customZimFavicon}]`)
          })
      } else {
        try {
          content = fs.readFileSync(customZimFavicon)
        } catch (err) {
          throw new Error(`Failed to read custom zim favicon from [${customZimFavicon}]`)
        }
      }
      try {
        return sharp(content).resize(48, 48, { fit: sharp.fit.inside, withoutEnlargement: true }).png().toBuffer()
      } catch (e) {
        throw new Error('Failed to read or process IllustrationMetadata using sharp')
      }
    }

    const apiUrlDirector = new ApiURLDirector(MediaWiki.apiUrl.href)

    const body = await downloader.getJSON<any>(apiUrlDirector.buildSiteInfoURL())

    const entries = body.query.general
    if (!entries.logo) {
      throw new Error(
        `********\nNo site Logo Url. Expected a string, but got [${entries.logo}].\n\nPlease try specifying a customZimFavicon (--customZimFavicon=./path/to/your/file.ico)\n********`,
      )
    }

    const parsedUrl = urlParser.parse(entries.logo)
    const logoUrl = parsedUrl.protocol ? entries.logo : MediaWiki.baseUrl.protocol + entries.logo
    const { content } = await downloader.downloadContent(logoUrl)
    return sharp(content).resize(48, 48, { fit: sharp.fit.inside, withoutEnlargement: true }).png().toBuffer()
  }

  async function saveFavicon(zimCreator: ZimCreator, data: Buffer): Promise<any> {
    logger.log('Saving favicon.png...')
    try {
      const article = new ZimArticle({ url: 'favicon', mimeType: 'image/png', data, ns: '-' })
      return zimCreator.addArticle(article)
    } catch (e) {
      throw new Error('Failed to save favicon')
    }
  }

  function getMainPage(dump: Dump, zimCreator: ZimCreator, downloader: Downloader) {
    async function createMainPage() {
      logger.log('Creating main page...')
      const doc = domino.createDocument(
        articleListHomeTemplate.replace(
          '</head>',
          genHeaderCSSLink(config, 'mobile_main_page', dump.mwMetaData.mainPage) +
            '\n' +
            genHeaderCSSLink(config, 'style', dump.mwMetaData.mainPage) +
            '\n' +
            genHeaderScript(config, 'images_loaded.min', dump.mwMetaData.mainPage) +
            '\n' +
            genHeaderScript(config, 'masonry.min', dump.mwMetaData.mainPage) +
            '\n' +
            genHeaderScript(config, 'article_list_home', dump.mwMetaData.mainPage) +
            '\n' +
            genCanonicalLink(config, dump.mwMetaData.webUrl, dump.mwMetaData.mainPage) +
            '\n' +
            '\n</head>',
        ),
      )
      doc.querySelector('title').innerHTML = sanitizeString(dump.mwMetaData.title) || sanitizeString(dump.opts.customZimTitle)
      const articlesWithImages: ArticleDetail[] = []
      const allArticles: ArticleDetail[] = []
      for (const articleId of articleListLines) {
        const articleDetail = await articleDetailXId.get(articleId)
        if (articleDetail) {
          allArticles.push(articleDetail)
          if (articleDetail.thumbnail) {
            articlesWithImages.push(articleDetail)
            if (articlesWithImages.length >= 100) {
              break
            }
          }
        }
      }

      if (articlesWithImages.length > MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE) {
        const articlesWithImagesEl = articlesWithImages.map((article) => makeArticleImageTile(dump, article, downloader.webp)).join('\n')
        doc.body.innerHTML = `<div id='container'><div id='content'>${articlesWithImagesEl}</div></div>`
      } else {
        const articlesWithoutImagesEl = allArticles.map((article) => makeArticleListItem(dump, article)).join('\n')
        doc.body.innerHTML = `<ul id='list'>${articlesWithoutImagesEl}</ul>`
      }

      /* Write the static html file */
      const article = new ZimArticle({ url: 'index', data: doc.documentElement.outerHTML, ns: 'A', mimeType: 'text/html', title: 'Main Page' })
      return zimCreator.addArticle(article)
    }

    function createMainPageRedirect() {
      logger.log(`Create main page redirection from [index] to [${'A/' + mainPage}]`)
      const article = new ZimArticle({
        url: 'index',
        shouldIndex: true,
        data: '',
        ns: 'A',
        mimeType: 'text/html',
        title: mainPage,
        redirectUrl: mainPage,
      })
      return zimCreator.addArticle(article)
    }

    return mainPage ? createMainPageRedirect() : createMainPage()
  }

  async function fetchArticleDetail(articleId: string) {
    return await articleDetailXId.get(articleId)
  }

  async function updateArticleThumbnail(articleDetail: any, articleId: string) {
    const imageUrl = articleDetail.thumbnail
    if (!imageUrl) return

    const { width: oldWidth } = getSizeFromUrl(imageUrl.source)
    const suitableResUrl = imageUrl.source.replace(`/${oldWidth}px-`, '/500px-').replace(`-${oldWidth}px-`, '-500px-')
    const { mult, width } = getSizeFromUrl(suitableResUrl)
    const path = getMediaBase(suitableResUrl, false)

    articleDetail.internalThumbnailUrl = getRelativeFilePath('Main_Page', getMediaBase(suitableResUrl, true), 'I')

    await Promise.all([filesToDownloadXPath.set(path, { url: urlHelper.serializeUrl(suitableResUrl), mult, width } as FileDetail), articleDetailXId.set(articleId, articleDetail)])
  }

  async function getThumbnailsData(): Promise<void> {
    if (customMainPage || !articleList || articleListLines.length <= MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE) return

    logger.log('Updating article thumbnails for articles')

    let articleIndex = 0
    let articlesWithImages = 0

    while (articleIndex < articleListLines.length && articlesWithImages <= 100) {
      const articleId = articleListLines[articleIndex]
      articleIndex++

      try {
        const articleDetail = await fetchArticleDetail(articleId)
        if (!articleDetail) continue

        await updateArticleThumbnail(articleDetail, articleId)
        articlesWithImages++
      } catch (err) {
        logger.warn(`Failed to parse thumbnail for [${articleId}], skipping...`)
      }
    }
  }

  MediaWiki.reset()
  RedisStore.close()

  return dumps
}

export { execute }
