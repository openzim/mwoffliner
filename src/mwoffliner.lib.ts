// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types.d.ts" />

/* ********************************** */
/* MODULE VARIABLE SECTION ********** */
/* ********************************** */

import fs, { readFileSync } from 'fs'
import os from 'os'
import pmap from 'p-map'
import sharp from 'sharp'
import domino from 'domino'
import { rimraf } from 'rimraf'
import { fileURLToPath } from 'url'
import semver from 'semver'
import * as path from 'path'
import { Blob, Compression, ContentProvider, Creator, StringItem } from '@openzim/libzim'
import { checkApiAvailability, getArticleIds } from './util/mw-api.js'
import { zimCreatorMutex } from './mutex.js'
import { check_all } from './sanitize-argument.js'

import {
  MAX_CPU_CORES,
  MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE,
  downloadAndSaveModule,
  downloadAndSaveStartupModule,
  getModuleDependencies,
  genCanonicalLink,
  genHeaderCSSLink,
  genHeaderScript,
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
  addWebpJsScripts,
  extractArticleList,
  getTmpDirectory,
  validateMetadata,
  truncateUtf8Bytes,
} from './util/index.js'
import S3 from './S3.js'
import RedisStore from './RedisStore.js'
import * as logger from './Logger.js'
import { Dump } from './Dump.js'
import { config } from './config.js'
import MediaWiki from './MediaWiki.js'
import Downloader from './Downloader.js'
import RenderingContext from './renderers/rendering.context.js'
import { articleListHomeTemplate, htmlRedirectTemplateCode } from './Templates.js'
import { downloadFiles, saveArticles } from './util/saveArticles.js'
import { getCategoriesForArticles, trimUnmirroredPages } from './util/categories.js'
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
    mwIndexPhpPath,
    mwActionApiPath,
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
    javaScript: _javaScript,
    addModules: _addModules,
    customZimFavicon,
    optimisationCacheUrl,
    customFlavour,
    forceRender,
    forceSkin,
    langVariant,
  } = argv

  let { articleList, articleListToIgnore } = argv

  logger.setVerboseLevel(verbose ? verbose : 'log') // Default log level is 'log'

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
    const s3UrlObj = new URL(optimisationCacheUrl)
    const s3Url = (s3UrlObj.protocol || 'https:') + '//' + (s3UrlObj.host || '') + (s3UrlObj.pathname || '')
    s3Obj = new S3(s3Url, s3UrlObj.searchParams, requestTimeout * 1000 || config.defaults.requestTimeout, argv.insecure)
    await s3Obj.initialise().then(() => {
      logger.log('Successfully logged in S3')
    })
  }

  // Extract S3 obj to pass to downloader class
  const s3 = s3Obj ? s3Obj : {}

  /* Wikipedia/... URL; Normalize by adding trailing / as necessary */
  MediaWiki.base = mwUrl
  MediaWiki.getCategories = !!argv.getCategories
  MediaWiki.actionApiPath = mwActionApiPath
  MediaWiki.domain = mwDomain
  MediaWiki.password = mwPassword
  MediaWiki.username = mwUsername

  const javaScript = _javaScript || 'trusted'
  const addModules = _addModules ? String(_addModules).split(',') : []
  const trustedJs = javaScript === 'none' ? null : javaScript === 'trusted' ? config.output.mw.js_trusted.concat(addModules) : []

  /* Download helpers; TODO: Merge with something else / expand this. */
  Downloader.init = {
    uaString: `${config.userAgent} (${adminEmail})`,
    speed,
    reqTimeout: requestTimeout * 1000 || config.defaults.requestTimeout,
    optimisationCacheUrl,
    s3,
    webp,
    trustedJs,
    insecure: argv.insecure,
  }

  /* perform login */
  await MediaWiki.login()

  /* set Redis settings so that we can check them ; do it only once, should we call execute twice */
  if (!RedisStore.client) {
    RedisStore.setOptions(argv.redis || config.defaults.redisPath)
  }

  await check_all(argv)

  const addNamespaces = _addNamespaces
    ? String(_addNamespaces)
        .split(',')
        .map((a: string) => Number(a))
    : []

  /* Get MediaWiki Info */
  let mwMetaData
  try {
    mwMetaData = await MediaWiki.getMwMetaData({ mwWikiPath, mwIndexPhpPath, addNamespaces, mwRestApiPath, mwModulePath, forceSkin, langVariant })
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
    Date: new Date().toISOString().split('T')[0],
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
  await MediaWiki.hasCoordinates()
  await MediaWiki.hasWikimediaDesktopApi()
  const hasWikimediaMobileApi = await MediaWiki.hasWikimediaMobileApi()
  await MediaWiki.hasRestApi()
  await MediaWiki.hasVisualEditorApi()
  await MediaWiki.hasActionParseApi()
  await MediaWiki.hasModuleApi()

  await RenderingContext.createRenderers(forceRender, hasWikimediaMobileApi)

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

  logger.info('Getting article ids')
  let stime = Date.now()
  await getArticleIds(mainPage, articleList ? articleListLines : null, articleListToIgnore ? articleListToIgnoreLines : null)
  logger.log(`Got ArticleIDs in ${(Date.now() - stime) / 1000} seconds`)

  if (MediaWiki.getCategories) {
    await getCategoriesForArticles(articleDetailXId)

    while ((await trimUnmirroredPages()) > 0) {
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
    } catch {
      shouldSkip = true
    }

    if (shouldSkip) {
      logger.log('Skipping dump')
    } else {
      await doDump(dump)
      await filesToDownloadXPath.flush()
      Downloader.cssDependenceUrls = {}
      logger.log('Finished dump')
    }
  }

  logger.log('Closing HTTP agents...')

  logger.log('All dumping(s) finished with success.')

  async function doDump(dump: Dump) {
    const outZim = path.resolve(dump.opts.outputDirectory, dump.computeFilenameRadical() + '.zim')
    logger.log(`Writing ZIM to [${outZim}]`)
    dump.outFile = outZim

    const metadata = {
      ...metaDataRequiredKeys,
      Tags: dump.computeZimTags(),
      Name: dump.computeFilenameRadical(false, true, true),
      Flavour: dump.computeFlavour(),
      Scraper: `mwoffliner ${packageJSON.version}`,
      Source: MediaWiki.webUrl.hostname,
      ...(dump.opts.customZimLongDescription ? { LongDescription: `${dump.opts.customZimLongDescription}` } : {}),
    }
    validateMetadata(metadata)

    const zimCreator = new Creator().configCompression(Compression.Zstd)
    if (!dump.opts.withoutZimFullTextIndex) {
      zimCreator.configIndexing(true, dump.mwMetaData.langIso3)
    }
    zimCreator.startZimCreation(outZim)

    // Helper function to transform a Buffer into a libzim ContentProvider
    const createBufferContentProvider = (buffer: Buffer): ContentProvider => {
      let dataSent = false
      return {
        size: buffer.length,
        feed: () => {
          if (!dataSent) {
            dataSent = true
            return new Blob(buffer)
          }
          return new Blob()
        },
      }
    }

    Object.entries(metadata).forEach(([key, value]) => {
      zimCreator.addMetadata(key, Buffer.isBuffer(value) ? createBufferContentProvider(value) : value, key.startsWith('Illustration_') ? 'image/png' : 'text/plain')
    })

    await saveFavicon(zimCreator, metaDataRequiredKeys['Illustration_48x48@1'])

    if (Downloader.webp) {
      logger.log('Adding webp polyfilling JS scripts')
      await addWebpJsScripts(zimCreator)
    }

    await getThumbnailsData()

    if (!mainPage) {
      logger.log('Checking Main Page rendering')
      await createIndexPage(dump, zimCreator, true)
    }

    logger.log('Getting articles')
    stime = Date.now()
    const { jsModuleDependencies, cssModuleDependencies, staticFilesList } = await saveArticles(zimCreator, dump)
    logger.log(`Fetching Articles finished in ${(Date.now() - stime) / 1000} seconds`)

    logger.info('Copying Static Resource Files')
    await saveStaticFiles(staticFilesList, zimCreator)

    if (javaScript === 'none') {
      jsModuleDependencies.clear()
    } else {
      // Get list of all possible modules from startup
      const allModules = await downloadAndSaveStartupModule(zimCreator)
      addModules.forEach((oneModule) => {
        jsModuleDependencies.add(oneModule)
      })
      // Include known dynamic dependencies
      const dynamicJsDeps = config.output.mw.js_dynamic_dependencies
      Object.keys(dynamicJsDeps).forEach((oneDep: keyof typeof dynamicJsDeps) => {
        if (jsModuleDependencies.has(oneDep)) {
          dynamicJsDeps[oneDep].forEach((extraDep) => {
            jsModuleDependencies.add(extraDep)
          })
        }
      })
      // Include all dependencies of the dependencies
      jsModuleDependencies.forEach((oneDep) => {
        const oneModule = allModules.find((oneModule) => oneModule[0] === oneDep)
        if (!oneModule) {
          jsModuleDependencies.delete(oneDep)
          return logger.warn(`Unknown JS module [${oneDep}] removed`)
        }
        getModuleDependencies(oneModule, allModules).forEach((extraDep) => {
          jsModuleDependencies.add(extraDep)
        })
      })
      // Don't store JS for CSS modules
      cssModuleDependencies.forEach((oneModule) => {
        if (!addModules.includes(oneModule)) {
          jsModuleDependencies.delete(oneModule)
        }
      })
    }

    logger.log(`Found [${jsModuleDependencies.size}] js module dependencies`)
    logger.log(`Found [${cssModuleDependencies.size}] style module dependencies`)

    const allDependenciesWithType = [
      { type: 'js', moduleList: Array.from(jsModuleDependencies) },
      { type: 'css', moduleList: Array.from(cssModuleDependencies) },
    ]

    logger.log('Downloading module dependencies')
    await Promise.all(
      allDependenciesWithType.map(({ type, moduleList }) => {
        return pmap(
          moduleList,
          (oneModule) => {
            if (oneModule.startsWith('user')) {
              return
            }
            return downloadAndSaveModule(zimCreator, oneModule, type as any)
          },
          { concurrency: Downloader.speed },
        )
      }),
    )

    await downloadFiles(filesToDownloadXPath, filesToRetryXPath, zimCreator, dump)

    logger.log('Writing Article Redirects')
    await writeArticleRedirects(dump, zimCreator)

    const mainPath = mainPage ? mainPage : await createIndexPage(dump, zimCreator, false)
    zimCreator.setMainPath(mainPath)

    logger.log('Finishing ZIM Creation')
    await zimCreator.finishZimCreation()

    logger.log('Summary of scrape actions:', JSON.stringify(dump.status, null, '\t'))
    logger.log(`ZIM is ready at [${outZim}]`)
  }

  /* ********************************* */
  /* FUNCTIONS *********************** */
  /* ********************************* */

  async function writeArticleRedirects(dump: Dump, zimCreator: Creator) {
    let processed = -1
    const total = await redirectsXId.len()
    logger.log(`${total} redirects to process`)
    await redirectsXId.iterateItems(Downloader.speed, async (redirects) => {
      for (const [redirectId, { targetId, fragment }] of Object.entries(redirects)) {
        processed += 1
        if (processed > 0 && processed % 5000 == 0) {
          logger.log(`${processed} redirects have been processed (${Math.round((processed / total) * 1000) / 10} %)`)
        }
        if (await RedisStore.articleDetailXId.exists(redirectId)) {
          logger.warn(`Skipping redirect of '${redirectId}' because it already exists as an article`)
          continue
        }
        if (redirectId === targetId) {
          logger.warn(`Skipping redirect of '${redirectId}' to self`)
          continue
        }
        if (!(await RedisStore.articleDetailXId.exists(targetId))) {
          logger.warn(`Skipping redirect of '${redirectId}' to '${targetId}' because target is not a known article`)
          continue
        }
        // We fake a title, by just removing the underscores
        const redirectTitle = truncateUtf8Bytes(String(redirectId).replace(/_/g, ' '), 245)
        if (fragment) {
          // Should we have a fragment (i.e. we redirect to a section of an article), this is not (yet) supported by libzim
          // (to have such a redirect with a fragment inside the path), so we create a "fake" entry with only an HTML-based
          // redirect inside
          const htmlTemplateString = htmlRedirectTemplateCode()
            .replace(/__TITLE__/g, redirectTitle)
            // we have to replace space in fragment with underscores, see https://phabricator.wikimedia.org/T398724
            .replace(/__TARGET__/g, `${targetId}#${fragment.replace(/ /g, '_')}`)
            .replace(/__RELATIVE_FILE_PATH__/g, getRelativeFilePath(redirectId, ''))
          await zimCreatorMutex.runExclusive(() => zimCreator.addItem(new StringItem(redirectId, 'text/html', redirectTitle, { FRONT_ARTICLE: 1 }, htmlTemplateString)))
        } else {
          // Otherwise we simply add a "regular" libzim redirect
          await zimCreatorMutex.runExclusive(() => zimCreator.addRedirection(redirectId, redirectTitle, targetId, { FRONT_ARTICLE: 1 }))
        }

        dump.status.redirects.written += 1
      }
    })
  }

  async function getIllustrationMetadata(): Promise<Buffer> {
    const resizeOptions: sharp.ResizeOptions = { fit: sharp.fit.contain, withoutEnlargement: true, background: { r: 1, g: 1, b: 1, alpha: 0 } }
    if (customZimFavicon) {
      const faviconIsRemote = customZimFavicon.includes('http')
      let content
      if (faviconIsRemote) {
        logger.log(`Downloading remote ZIM favicon from [${customZimFavicon}]`)
        content = await Downloader.request({ url: customZimFavicon, method: 'GET', ...Downloader.arrayBufferRequestOptions })
          .then((a) => a.data)
          .catch(() => {
            throw new Error(`Failed to download custom ZIM favicon from [${customZimFavicon}]`)
          })
      } else {
        try {
          content = fs.readFileSync(customZimFavicon)
        } catch {
          throw new Error(`Failed to read custom ZIM favicon from [${customZimFavicon}]`)
        }
      }
      try {
        return sharp(content).resize(48, 48, resizeOptions).png().toBuffer()
      } catch {
        throw new Error('Failed to read or process IllustrationMetadata using sharp')
      }
    }

    if (!mwMetaData.logo) {
      throw new Error(`********\nNo site Logo Url found in site info.\n\nPlease try specifying a customZimFavicon (--customZimFavicon=./path/to/your/file.ico)\n********`)
    }

    const parsedUrl = new URL(mwMetaData.logo, MediaWiki.baseUrl)
    const logoUrl = parsedUrl.protocol ? mwMetaData.logo : MediaWiki.baseUrl.protocol + mwMetaData.logo
    const { content } = await Downloader.downloadContent(logoUrl, 'image')
    return sharp(content).resize(48, 48, resizeOptions).png().toBuffer()
  }

  async function saveFavicon(zimCreator: Creator, data: Buffer): Promise<any> {
    logger.log('Saving favicon.png...')
    try {
      return zimCreator.addItem(new StringItem(`${config.output.dirs.res}/favicon.png`, 'image/png', null, { FRONT_ARTICLE: 0 }, data))
    } catch {
      throw new Error('Failed to save favicon')
    }
  }

  async function getIndexPath() {
    for (const candidate of config.candidateIndexPath) {
      if (!(await RedisStore.articleDetailXId.exists(candidate)) && !(await RedisStore.redirectsXId.exists(candidate))) {
        return candidate
      }
    }
    throw new Error('All candidate main page paths are already used by an article or a redirect')
  }

  /**
   * Create a custom index page used as main page, listing all articles in the ZIM
   * Mainly used for selections which do not have a proper main page to use
   * Supports a dry-run mode where main page is not really created, to be used before we
   * fetch all articles. Real index creation must be done after we have fetched all articles,
   * should some have failed we do not want to add them to the index
   */
  async function createIndexPage(dump: Dump, zimCreator: Creator, dryrun: boolean) {
    const indexPagePath = await getIndexPath()

    const doc = domino.createDocument(
      articleListHomeTemplate
        .replace(
          '</head>',
          genHeaderCSSLink(config, 'mobile_main_page', dump.mwMetaData.mainPage, config.output.dirs.res) +
            '\n' +
            genHeaderCSSLink(config, 'style', dump.mwMetaData.mainPage, config.output.dirs.res) +
            '\n' +
            genHeaderScript(config, 'images_loaded.min', dump.mwMetaData.mainPage, config.output.dirs.res) +
            '\n' +
            genHeaderScript(config, 'masonry.min', dump.mwMetaData.mainPage, config.output.dirs.res) +
            '\n' +
            genHeaderScript(config, 'article_list_home', dump.mwMetaData.mainPage, config.output.dirs.res) +
            '\n' +
            genCanonicalLink(config, dump.mwMetaData.webUrl, dump.mwMetaData.mainPage) +
            '\n' +
            '\n</head>',
        )
        .replace(/__ASSETS_DIR__/g, config.output.dirs.assets)
        .replace(/__RES_DIR__/g, config.output.dirs.res)
        .replace(/__MW_DIR__/g, config.output.dirs.mediawiki)
        .replace(/__RELATIVE_FILE_PATH__/g, getRelativeFilePath(indexPagePath, '')),
    )
    doc.querySelector('title').innerHTML = sanitizeString(dump.mwMetaData.title) || sanitizeString(dump.opts.customZimTitle)
    const articlesWithImages: ArticleDetail[] = []
    const allArticles: ArticleDetail[] = []
    for (const articleId of articleListLines) {
      const articleDetail = await articleDetailXId.get(articleId)
      if (articleDetail) {
        allArticles.push(articleDetail)
        if (articleDetail.thumbnail && articleDetail.internalThumbnailUrl) {
          articlesWithImages.push(articleDetail)
          if (articlesWithImages.length >= 100) {
            break
          }
        }
      }
    }

    if (articlesWithImages.length > MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE) {
      const articlesWithImagesEl = articlesWithImages.map((article) => makeArticleImageTile(dump, article)).join('\n')
      doc.body.innerHTML = `<div id='container'><div id='content'>${articlesWithImagesEl}</div></div>`
    } else {
      const articlesWithoutImagesEl = allArticles.map((article) => makeArticleListItem(dump, article)).join('\n')
      doc.body.innerHTML = `<ul id='list'>${articlesWithoutImagesEl}</ul>`
    }

    /* Write the static html file */
    if (!dryrun) {
      const item = new StringItem(indexPagePath, 'text/html', 'Main Page', {}, doc.documentElement.outerHTML)
      zimCreator.addItem(item)
    }

    return indexPagePath
  }

  async function fetchArticleDetail(articleId: string) {
    return articleDetailXId.get(articleId)
  }

  async function updateArticleThumbnail(articleDetail: any, articleId: string) {
    const imageUrl = articleDetail.thumbnail

    const { width: oldWidth } = getSizeFromUrl(imageUrl.source)
    const suitableResUrl = imageUrl.source.replace(`/${oldWidth}px-`, '/500px-').replace(`-${oldWidth}px-`, '-500px-')
    const { mult, width } = getSizeFromUrl(suitableResUrl)
    const path = getMediaBase(suitableResUrl, false)

    articleDetail.internalThumbnailUrl = getRelativeFilePath('Main_Page', getMediaBase(suitableResUrl, true))

    await Promise.all([
      filesToDownloadXPath.set(path, { url: urlHelper.serializeUrl(suitableResUrl), mult, width, kind: 'image' } as FileDetail),
      articleDetailXId.set(articleId, articleDetail),
    ])
  }

  async function getThumbnailsData(): Promise<void> {
    if (customMainPage || !articleList || articleListLines.length <= MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE) return

    logger.log('Updating article thumbnails for articles')

    let articleIndex = 0
    let articlesWithImages = 0

    while (articleIndex < articleListLines.length && articlesWithImages < 100) {
      const articleId = articleListLines[articleIndex]
      articleIndex++

      try {
        const articleDetail = await fetchArticleDetail(articleId)
        if (!articleDetail || !articleDetail.thumbnail) continue

        await updateArticleThumbnail(articleDetail, articleId)
        articlesWithImages++
      } catch {
        logger.warn(`Failed to parse thumbnail for [${articleId}], skipping...`)
      }
    }
  }

  MediaWiki.reset()
  RedisStore.close()

  return dumps
}

export { execute }
