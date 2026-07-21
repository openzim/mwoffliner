// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types.d.ts" />

/* ********************************** */
/* MODULE VARIABLE SECTION ********** */
/* ********************************** */

import fs, { readFileSync } from 'fs'
import pmap from 'p-map'
import sharp, { type ResizeOptions } from 'sharp'
import domino from 'domino'
import { rimraf } from 'rimraf'
import { fileURLToPath } from 'url'
import semver from 'semver'
import * as path from 'path'
import { Blob, Compression, ContentProvider, Creator, StringItem } from '@openzim/libzim'
import { getPages } from './util/mw-api.js'
import { createTranslator } from './i18n.js'
import { zimCreatorMutex } from './mutex.js'
import { check_all } from './sanitize-argument.js'

import {
  MIN_IMAGE_THRESHOLD_INDEX_PAGE,
  downloadAndSaveModule,
  downloadAndSaveStartupModule,
  getModuleDependencies,
  downloadAndSaveCustomCss,
  downloadAndSaveCustomJs,
  downloadAndSaveMathJaxSource,
  genCanonicalLink,
  genHeaderCSSLink,
  genHeaderScript,
  getDumps,
  getMediaBase,
  getRelativeFilePath,
  getSizeFromUrl,
  isValidEmail,
  makePageImageTile,
  makePageListItem,
  mkdirPromise,
  sanitizeString,
  saveStaticFiles,
  extractPageList,
  getTmpDirectory,
  validateMetadata,
  truncateZimEntryTitleWords,
  makeZimPath,
  replaceSafe,
} from './util/index.js'
import S3 from './S3.js'
import RedisStore from './RedisStore.js'
import * as logger from './Logger.js'
import { Dump } from './Dump.js'
import { config } from './config.js'
import MediaWiki from './MediaWiki.js'
import Downloader from './Downloader.js'
import RenderingContext from './renderers/rendering.context.js'
import { pageListHomeTemplate, htmlRedirectTemplateCode } from './Templates.js'
import { savePages } from './util/savePages.js'
import { PAGE_REQUEST_INTERVAL, CATEGORIES_PAGE_SIZE } from './util/const.js'
import urlHelper from './util/url.helper.js'
import { parseCustomCssUrls, customCssUrlToFilename, parseCustomJsUrls, customJsUrlToFilename } from './util/customCssJs.js'
import FileManager from './util/FileManager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const packageJSON = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8'))

async function execute(argv: any) {
  const {
    speed: _speed,
    adminEmail,
    logLevel,
    minifyHtml,
    keepEmptySections,
    mwUrl,
    mwActionApiPath,
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
    customZimName,
    customZimFilename,
    withoutZimFullTextIndex,
    webp,
    format,
    resume,
    publisher: _publisher,
    outputDirectory: _outputDirectory,
    addNamespaces: _addNamespaces,
    onlyNamespaces: _onlyNamespaces,
    addContentModels: _addContentModels,
    javaScript: _javaScript,
    addModules: _addModules,
    customZimFavicon,
    optimisationCacheUrl,
    customFlavour,
    forceRender,
    forceSkin,
    langVariant,
    customCss,
    customJs,
    userAgent: _userAgent,
    stableRevision,
    getCategories,
    categoriesPageSize,
    mathJaxSource,
    mathJaxConfig,
    mathJaxEntryPoint,
    mathJaxAllPages,
  } = argv

  let { pageList, pageListToIgnore } = argv

  /* *********************************** */
  /*       SYSTEM VARIABLE SECTION       */
  /* *********************************** */

  const dumpFormats = getDumps(format)
  const langVariants: string[] = getDumps(langVariant)

  /* ********************************* */
  /* CUSTOM VARIABLE SECTION ********* */
  /* ********************************* */

  logger.setLogLevel(logLevel ?? 'info')

  logger.debug(`Starting mwoffliner v${packageJSON.version}...`)

  // TODO: Move it to sanitize method
  if (pageList) pageList = String(pageList)
  if (pageListToIgnore) pageListToIgnore = String(pageListToIgnore)

  // Parse --customCss and populate Downloader so renderers can use the list
  if (customCss) {
    Downloader.customCssUrls = parseCustomCssUrls(String(customCss))
    if (Downloader.customCssUrls.length > 0) {
      logger.info(`Custom CSS URLs configured: ${Downloader.customCssUrls.join(', ')}`)
    }
  }

  // Parse --customJs and populate Downloader so renderers can use the list
  if (customJs) {
    Downloader.customJsUrls = parseCustomJsUrls(String(customJs))
    if (Downloader.customJsUrls.length > 0) {
      logger.info(`Custom JS URLs configured: ${Downloader.customJsUrls.join(', ')}`)
    }
  }

  if (mathJaxSource) {
    Downloader.mathJaxSource = String(mathJaxSource)
    logger.info(`MathJax source configured: ${Downloader.mathJaxSource}`)
  }
  if (mathJaxConfig) {
    Downloader.mathJaxConfig = String(mathJaxConfig)
    logger.info(`MathJax config configured: ${Downloader.mathJaxConfig}`)
  }
  if (mathJaxEntryPoint) {
    Downloader.mathJaxEntryPoint = String(mathJaxEntryPoint)
  }
  if (mathJaxAllPages) {
    Downloader.mathJaxAllPages = true
    logger.info('MathJax scripts will be injected on all pages')
  }

  const publisher = _publisher || config.defaults.publisher

  // TODO: Move it to sanitize method
  /* HTTP user-agent string */
  // const adminEmail = argv.adminEmail;
  if (!isValidEmail(adminEmail)) {
    throw new Error(`Admin email [${adminEmail}] is not valid`)
  }

  const speed = _speed || 1
  const workers = speed >= 1 ? Math.floor(speed) : 1
  const pageRequestInterval = speed < 1 ? Math.round(PAGE_REQUEST_INTERVAL / speed) : PAGE_REQUEST_INTERVAL

  /* Check Node.js version */
  const nodeVersionSatisfiesPackage = semver.satisfies(process.version, packageJSON.engines.node)
  if (!nodeVersionSatisfiesPackage) {
    logger.warn(`***********\n\n\tCurrent node version is [${process.version}]. We recommend [${packageJSON.engines.node}]\n\n***********`)
  }

  /* Instantiate custom flavour module */
  logger.debug(`Using custom flavour: ${customFlavour || 'no'}`)
  const customProcessor = customFlavour ? new (await import(customFlavour)).default() : null

  let s3Obj
  // Check for S3 creds
  if (optimisationCacheUrl) {
    // Decompose the url with path and other S3 creds
    const s3UrlObj = new URL(optimisationCacheUrl)
    const s3Url = (s3UrlObj.protocol || 'https:') + '//' + (s3UrlObj.host || '') + (s3UrlObj.pathname || '')
    s3Obj = new S3(s3Url, s3UrlObj.searchParams, requestTimeout * 1000 || config.defaults.requestTimeout, argv.insecure)
    await s3Obj.initialise().then(() => {
      logger.info('Successfully logged in S3')
    })
  }

  // Extract S3 obj to pass to downloader class
  const s3 = s3Obj ? s3Obj : {}

  /* Wikipedia/... URL; Normalize by adding trailing / as necessary */
  MediaWiki.base = mwUrl
  MediaWiki.getCategories = !!getCategories
  MediaWiki.categoriesPageSize = categoriesPageSize || CATEGORIES_PAGE_SIZE
  MediaWiki.actionApiPath = mwActionApiPath
  MediaWiki.domain = mwDomain
  MediaWiki.password = mwPassword
  MediaWiki.username = mwUsername

  const javaScript = _javaScript || 'trusted'
  const addModules = _addModules ? String(_addModules).split(',') : []
  const trustedJs = javaScript === 'none' ? null : javaScript === 'trusted' ? config.output.mw.js_trusted.concat(addModules) : []

  /* HTTP user-agent string */
  const uaString = `${_userAgent || config.userAgent} (${adminEmail})`
  logger.info(`Using User-Agent: ${uaString}`)

  /* Download helpers; TODO: Merge with something else / expand this. */
  Downloader.init = {
    uaString,
    workers,
    pageRequestInterval: pageRequestInterval,
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

  const addContentModels = _addContentModels
    ? String(_addContentModels)
        .split(',')
        .map((a: string) => a.trim())
    : []

  const onlyNamespaces = _onlyNamespaces
    ? String(_onlyNamespaces)
        .split(',')
        .map((a: string) => Number(a))
    : []

  /* Get MediaWiki Info */
  let mwMetaData
  try {
    mwMetaData = await MediaWiki.getMwMetaData({ addNamespaces, onlyNamespaces, mwModulePath, forceSkin, langVariants })
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
  let mainPage: PageTitle = pageList ? '' : mwMetaData.mainPage

  if (customMainPage) {
    mainPage = customMainPage.replace(/_/g, ' ')
  }

  MediaWiki.apiCheckPageTitle = mwMetaData.mainPage
  await MediaWiki.hasCoordinates()
  await MediaWiki.hasActionParseApi()
  await MediaWiki.hasModuleApi()

  if (stableRevision && !(await MediaWiki.hasFlaggedRevs())) {
    throw new Error('--stableRevision was specified but this wiki does not support stable revisions (FlaggedRevs extension not found)')
  }

  await RenderingContext.createRenderers(forceRender)

  await RedisStore.connect()
  // Output directory
  const outputDirectory = path.isAbsolute(_outputDirectory || '') ? _outputDirectory : path.join(process.cwd(), _outputDirectory || 'out')
  await mkdirPromise(outputDirectory)
  logger.info(`Using output directory ${outputDirectory}`)

  // Temporary directory
  const tmpDirectory = await getTmpDirectory()
  logger.info(`Using temporary directory ${tmpDirectory}`)

  process.on('exit', async (code) => {
    logger.info(`Exiting with code [${code}]`)
    logger.info(`Deleting temporary directory [${tmpDirectory}]`)
    rimraf.sync(tmpDirectory)
  })

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM')
    await RedisStore.close()
    process.exit(128 + 15)
  })
  process.on('SIGINT', async () => {
    logger.info('SIGINT')
    await RedisStore.close()
    process.exit(128 + 2)
  })

  const filenameDate = new Date().toISOString().slice(0, 7)

  const dumps: Dump[] = []

  /* ********************************* */
  /* GET CONTENT ********************* */
  /* ********************************* */

  const pagesToIgnore: PageTitle[] = []
  if (pageListToIgnore) {
    try {
      pagesToIgnore.push(...(await extractPageList(pageListToIgnore)))
      logger.debug(`pageListToIgnore has [${pagesToIgnore.length}] items`)
    } catch (err) {
      logger.error(`Failed to read pageListToIgnore from [${pageListToIgnore}]`, err)
      throw err
    }
  }

  const pages: PageTitle[] = []
  if (pageList) {
    try {
      pages.push(...(await extractPageList(pageList)))
      logger.info(`List of pages to include in the ZIM has [${pages.length}] items`)
    } catch (err) {
      logger.error(`Failed to read pageList from [${pageList}]`, err)
      throw err
    }
  }

  // When the page list contains exactly one page and no custom main
  // page was provided, use that page as the ZIM main page directly
  //(#1891)
  if (pages.length === 1 && !customMainPage) {
    mainPage = pages[0]
    logger.info(`Using single page list entry as main page: ${mainPage}`)
  }

  const t = await createTranslator(mwMetaData.langIso2 || 'en', 'en')

  for (const langVar of langVariants) {
    for (const dumpFormat of dumpFormats) {
      const dump = new Dump(
        dumpFormat,
        langVar,
        {
          tmpDir: tmpDirectory,
          username: mwUsername,
          password: mwPassword,
          outputDirectory,
          mainPage,
          pageList,
          publisher,
          customZimDescription,
          customZimLongDescription,
          customZimTags,
          customZimTitle,
          customZimName,
          customZimFilename,
          withoutZimFullTextIndex,
          resume,
          minifyHtml,
          keepEmptySections,
          tags: customZimTags,
          filenameDate,
          stableRevision,
        },
        { ...mwMetaData, mainPage },
        customProcessor,
        t,
      )
      dumps.push(dump)

      // compute ZIM metadata early to fail early in case of issue ; we do that check
      // for each dump, even if it will probably pass on all or fail on first one
      computeZimMetadata(dump)
    }
  }

  const allowedContentModels = ['wikitext', ...addContentModels]

  logger.debug('Getting pages details')
  let stime = Date.now()
  await getPages(mainPage, pages, pagesToIgnore, allowedContentModels)
  logger.info(`Got pages details in ${(Date.now() - stime) / 1000} seconds`)

  // Getting total number of pages from Redis
  logger.info(`Total pages found in Redis: ${await RedisStore.pagesStore.len()}`)

  if (mainPage && !(await RedisStore.pagesStore.exists(mainPage)) && !(await RedisStore.redirectsStore.exists(mainPage))) {
    throw new Error(`mainPage '${mainPage}' was not found`)
  }

  for (const dump of dumps) {
    // set main page since it might have changed since dump original creation
    dump.opts.mainPage = mainPage
    dump.mwMetaData.mainPage = mainPage
    dump.opts.firstPage = pages[0]
    let logStr = 'Doing dump:'
    if (dump.langVar) logStr += ' variant=' + dump.langVar
    logStr += ` format=${dump.format || 'all'}`
    logger.info(`******************** ${logStr} ********************`)
    let shouldSkip = false
    try {
      dump.checkResume()
    } catch {
      shouldSkip = true
    }
    if (shouldSkip) {
      logger.info('Skipping dump')
    } else {
      // Reset FileManager for the new dump
      FileManager.reset()

      // Check scraper is still logged-in (session from previous dump might have expired
      // due to inactivity when downloading files)
      await MediaWiki.login(true)

      await doDump(dump)
      await RedisStore.filesStore.flush()
      logger.info('Finished dump')
    }
  }

  logger.info('Closing HTTP agents...')

  logger.info('All dumping(s) finished with success.')

  function computeZimMetadata(dump: Dump) {
    dump.outFile = dump.computeZimFullPath()
    logger.info(`Writing ZIM to ${dump.outFile}`)

    dump.zimMetadata = {
      ...metaDataRequiredKeys,
      Tags: dump.computeZimTags(),
      Name: dump.computeZimName(),
      Flavour: dump.computeFlavour(),
      Scraper: `mwoffliner ${packageJSON.version}`,
      Source: MediaWiki.webUrl.hostname,
      ...(dump.opts.customZimLongDescription ? { LongDescription: `${dump.opts.customZimLongDescription}` } : {}),
    }
    validateMetadata(dump.zimMetadata)
  }

  async function doDump(dump: Dump) {
    const zimCreator = new Creator().configCompression(Compression.Zstd).configVerbose(logLevel === 'debug')
    if (!dump.opts.withoutZimFullTextIndex) {
      zimCreator.configIndexing(true, dump.mwMetaData.langIso3)
    }
    zimCreator.startZimCreation(dump.outFile)

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

    Object.entries(dump.zimMetadata).forEach(([key, value]) => {
      zimCreator.addMetadata(key, Buffer.isBuffer(value) ? createBufferContentProvider(value) : value, key.startsWith('Illustration_') ? 'image/png' : 'text/plain')
    })

    await saveFavicon(zimCreator, metaDataRequiredKeys['Illustration_48x48@1'])

    await getThumbnailsData()

    if (!mainPage) {
      logger.info('Checking Main Page rendering')
      await createIndexPage(dump, zimCreator, true)
    }

    // Download and save custom CSS files
    if (Downloader.customCssUrls.length > 0) {
      logger.info(`Downloading ${Downloader.customCssUrls.length} custom CSS file(s)`)
      const cssErrors: string[] = []
      for (const cssUrl of Downloader.customCssUrls) {
        try {
          const filename = customCssUrlToFilename(cssUrl)
          await downloadAndSaveCustomCss(zimCreator, cssUrl, filename)
        } catch (err) {
          cssErrors.push(`  - Failed to download [${cssUrl}]: ${err}`)
        }
      }
      if (cssErrors.length > 0) {
        throw new Error(`Failed to download custom CSS file(s):\n${cssErrors.join('\n')}`)
      }
    }

    // Download and save custom JS files
    if (Downloader.customJsUrls.length > 0) {
      logger.info(`Downloading ${Downloader.customJsUrls.length} custom JS file(s)`)
      const jsErrors: string[] = []
      for (const jsUrl of Downloader.customJsUrls) {
        try {
          const filename = customJsUrlToFilename(jsUrl)
          await downloadAndSaveCustomJs(zimCreator, jsUrl, filename)
        } catch (err) {
          jsErrors.push(`  - Failed to download [${jsUrl}]: ${err}`)
        }
      }
      if (jsErrors.length > 0) {
        throw new Error(`Failed to download custom JS file(s):\n${jsErrors.join('\n')}`)
      }
    }

    // Download MathJax config script and store it for inline injection into each page that needs it
    if (Downloader.mathJaxConfig) {
      logger.info(`Loading MathJax config from [${Downloader.mathJaxConfig}]`)
      if (/^https?:\/\//i.test(Downloader.mathJaxConfig)) {
        const { content } = await Downloader.downloadContent(Downloader.mathJaxConfig, 'data')
        Downloader.mathJaxConfigScript = content.toString()
      } else {
        Downloader.mathJaxConfigScript = fs.readFileSync(Downloader.mathJaxConfig, 'utf-8')
      }
      if (!Downloader.mathJaxConfigScript.trimStart().startsWith('<script')) {
        throw new Error(`MathJax config loaded from [${Downloader.mathJaxConfig}] does not start with a <script tag`)
      }
    }

    // Download and extract MathJax source ZIP into the ZIM
    if (Downloader.mathJaxSource) {
      await downloadAndSaveMathJaxSource(zimCreator, Downloader.mathJaxSource)
    }

    logger.info('Getting pages content')
    stime = Date.now()
    const { jsModuleDependencies, cssModuleDependencies, staticFilesList } = await savePages(zimCreator, dump)
    logger.info(`Got pages content in ${(Date.now() - stime) / 1000} seconds`)

    logger.debug('Copying Static Resource Files')
    await saveStaticFiles(staticFilesList, zimCreator)

    if (javaScript === 'none') {
      jsModuleDependencies.clear()
    } else {
      // Get list of all possible modules from startup
      const allModules = await downloadAndSaveStartupModule(zimCreator, dump.langVar)
      addModules.forEach((oneModule) => {
        jsModuleDependencies.add(oneModule)
      })
      // Include known dynamic dependencies
      const dynamicJsDeps = config.output.mw.js_dynamic_dependencies
      Object.keys(dynamicJsDeps).forEach((oneDep) => {
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

    logger.info(`Found [${jsModuleDependencies.size}] js module dependencies`)
    logger.info(`Found [${cssModuleDependencies.size}] style module dependencies`)

    const allDependenciesWithType = [
      { type: 'js', moduleList: Array.from(jsModuleDependencies) },
      { type: 'css', moduleList: Array.from(cssModuleDependencies) },
    ]

    logger.info('Downloading module dependencies')
    await Promise.all(
      allDependenciesWithType.map(({ type, moduleList }) => {
        return pmap(
          moduleList,
          (oneModule) => {
            if (oneModule.startsWith('user')) {
              return
            }
            return downloadAndSaveModule(zimCreator, oneModule, type as any, dump.langVar)
          },
          { concurrency: Downloader.workers },
        )
      }),
    )

    await FileManager.startDownloading(zimCreator, dump)

    logger.info('Writing Pages Redirects')
    await writePageRedirects(dump, zimCreator)

    const mainPath = mainPage ? makeZimPath(mainPage) : await createIndexPage(dump, zimCreator, false)
    zimCreator.setMainPath(mainPath)

    logger.info('Finishing ZIM Creation')
    await zimCreator.finishZimCreation()

    logger.info('Summary of scrape actions:', JSON.stringify(dump.status, null, '\t'))
    logger.info(`ZIM is ready at ${dump.outFile}`)
  }

  /* ********************************* */
  /* FUNCTIONS *********************** */
  /* ********************************* */

  async function writePageRedirects(dump: Dump, zimCreator: Creator) {
    let processed = -1
    const total = await RedisStore.redirectsStore.len()
    logger.info(`${total} redirects to process`)
    await RedisStore.redirectsStore.iterateItems(Downloader.workers, async (redirects) => {
      for (const { from, to, fragment } of Object.values(redirects)) {
        processed += 1
        if (processed > 0 && processed % 5000 === 0) {
          logger.info(`${processed} redirects have been processed (${Math.round((processed / total) * 1000) / 10} %)`)
        }
        if (await RedisStore.pagesStore.exists(from)) {
          logger.warn(`Skipping redirect of '${from}' because it already exists as a page`)
          continue
        }
        if (from === to) {
          logger.warn(`Skipping redirect of '${from}' to self`)
          continue
        }
        if (!(await RedisStore.pagesStore.exists(to))) {
          logger.warn(`Skipping redirect of '${from}' to '${to}' because target is not a known page`)
          continue
        }
        const redirectTitle = truncateZimEntryTitleWords(from)
        if (fragment) {
          // Ignore redirects to fragment in 'nodet' since there is mostly no chance the section does exists
          if (dump.nodet) {
            dump.status.redirects.ignored += 1
            continue
          }
          // Should we have a fragment (i.e. we redirect to a section of a page), this is not (yet) supported by libzim
          // (to have such a redirect with a fragment inside the path), so we create a "fake" entry with only an HTML-based
          // redirect inside
          const htmlTemplateString = replaceSafe(htmlRedirectTemplateCode())
            .replace(/__TITLE__/g, redirectTitle)
            // we have to replace space in fragment with underscores, see https://phabricator.wikimedia.org/T398724
            .replace(/__TARGET__/g, `${makeZimPath(to)}#${fragment.replace(/ /g, '_')}`)
            .replace(/__RELATIVE_FILE_PATH__/g, getRelativeFilePath(makeZimPath(from), ''))
            .toString()
          await zimCreatorMutex.runExclusive(() => zimCreator.addItem(new StringItem(makeZimPath(from), 'text/html', redirectTitle, { FRONT_ARTICLE: 1 }, htmlTemplateString)))
        } else {
          // Otherwise we simply add a "regular" libzim redirect
          await zimCreatorMutex.runExclusive(() => zimCreator.addRedirection(makeZimPath(from), redirectTitle, makeZimPath(to), { FRONT_ARTICLE: 1 }))
        }

        dump.status.redirects.written += 1
      }
    })
  }

  async function getIllustrationMetadata(): Promise<Buffer> {
    const resizeOptions: ResizeOptions = { fit: sharp.fit.contain, withoutEnlargement: true, background: { r: 1, g: 1, b: 1, alpha: 0 } }
    if (customZimFavicon) {
      const faviconIsRemote = customZimFavicon.includes('http')
      let content
      if (faviconIsRemote) {
        logger.info(`Downloading remote ZIM favicon from [${customZimFavicon}]`)
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
    logger.info('Saving favicon.png...')
    try {
      return zimCreator.addItem(new StringItem(`${config.output.dirs.res}/favicon.png`, 'image/png', null, { FRONT_ARTICLE: 0 }, data))
    } catch {
      throw new Error('Failed to save favicon')
    }
  }

  async function getIndexPath(): Promise<ZimPath> {
    for (const candidate of config.candidateIndexPath) {
      if (!(await RedisStore.pagesStore.exists(candidate)) && !(await RedisStore.redirectsStore.exists(candidate))) {
        return candidate as ZimPath
      }
    }
    throw new Error('All candidate main page paths are already used by a page or a redirect')
  }

  /**
   * Create a custom index page used as main page, listing all pages in the ZIM
   * Mainly used for selections which do not have a proper main page to use
   * Supports a dry-run mode where main page is not really created, to be used before we
   * fetch all pages. Real index creation must be done after we have fetched all pages,
   * should some have failed we do not want to add them to the index
   */
  async function createIndexPage(dump: Dump, zimCreator: Creator, dryrun: boolean) {
    const indexPagePath = await getIndexPath()

    const doc = domino.createDocument(
      pageListHomeTemplate
        .replace(
          '</head>',
          genHeaderCSSLink(config, 'mobile_main_page', indexPagePath, config.output.dirs.res) +
            '\n' +
            genHeaderCSSLink(config, 'style', indexPagePath, config.output.dirs.res) +
            '\n' +
            genHeaderScript(config, 'images_loaded.min', indexPagePath, config.output.dirs.res) +
            '\n' +
            genHeaderScript(config, 'masonry.min', indexPagePath, config.output.dirs.res) +
            '\n' +
            genHeaderScript(config, 'page_list_home', indexPagePath, config.output.dirs.res) +
            '\n' +
            genCanonicalLink(config, dump.mwMetaData.webUrl, indexPagePath) +
            '\n' +
            '\n</head>',
        )
        .replace(/__ASSETS_DIR__/g, config.output.dirs.assets)
        .replace(/__RES_DIR__/g, config.output.dirs.res)
        .replace(/__MW_DIR__/g, config.output.dirs.mediawiki)
        .replace(/__RELATIVE_FILE_PATH__/g, getRelativeFilePath(indexPagePath, '')),
    )
    doc.querySelector('title').innerHTML = sanitizeString(dump.mwMetaData.title) || sanitizeString(dump.opts.customZimTitle)
    const pagesWithImages: PageDetail[] = []
    const allPages: PageDetail[] = []
    for (const page of pages) {
      // check if this is a redirect
      const redirect = await RedisStore.redirectsStore.get(page)
      const entryTitle = redirect ? redirect.to : page

      const pageDetail = await RedisStore.pagesStore.get(entryTitle)
      if (pageDetail) {
        allPages.push(pageDetail)
        if (pageDetail.thumbnail && pageDetail.internalThumbnailUrl) {
          pagesWithImages.push(pageDetail)
          if (pagesWithImages.length >= 100) {
            break
          }
        }
      }
    }

    if (pagesWithImages.length > MIN_IMAGE_THRESHOLD_INDEX_PAGE) {
      const pagesWithImagesEl = pagesWithImages.map((page) => makePageImageTile(dump, page)).join('\n')
      doc.body.innerHTML = `<div id='container'><div id='content'>${pagesWithImagesEl}</div></div>`
    } else {
      const pagesWithoutImagesEl = allPages.map((page) => makePageListItem(dump, page)).join('\n')
      doc.body.innerHTML = `<ul id='list'>${pagesWithoutImagesEl}</ul>`
    }

    /* Write the static html file */
    if (!dryrun) {
      const item = new StringItem(indexPagePath, 'text/html', 'Main Page', {}, doc.documentElement.outerHTML)
      zimCreator.addItem(item)
    }

    return indexPagePath
  }

  async function updatePageThumbnail(pageDetail: any, pageTitle: string) {
    const imageUrl = pageDetail.thumbnail

    const { width: oldWidth } = getSizeFromUrl(imageUrl.source)
    const suitableResUrl = imageUrl.source.replace(`/${oldWidth}px-`, '/500px-').replace(`-${oldWidth}px-`, '-500px-')
    const { mult, width } = getSizeFromUrl(suitableResUrl)
    const path = getMediaBase(suitableResUrl, false)

    pageDetail.internalThumbnailUrl = getRelativeFilePath('Main_Page' as ZimPath, getMediaBase(suitableResUrl, true))

    await Promise.all([
      FileManager.addFileToProcess(path, { url: urlHelper.serializeUrl(suitableResUrl), mult, width, kind: 'image' } as FileDetail),
      RedisStore.pagesStore.set(pageTitle, pageDetail),
    ])
  }

  async function getThumbnailsData(): Promise<void> {
    if (customMainPage || !pageList || pages.length <= MIN_IMAGE_THRESHOLD_INDEX_PAGE) return

    logger.info('Updating page thumbnails for pages')

    let pageIndex = 0
    let pagesWithImages = 0

    while (pageIndex < pages.length && pagesWithImages < 100) {
      const pageTitle = pages[pageIndex]
      pageIndex++

      try {
        const pageDetail = await RedisStore.pagesStore.get(pageTitle)
        if (!pageDetail || !pageDetail.thumbnail) continue

        await updatePageThumbnail(pageDetail, pageTitle)
        pagesWithImages++
      } catch {
        logger.warn(`Failed to parse thumbnail for [${pageTitle}], skipping...`)
      }
    }
  }

  MediaWiki.reset()
  await RedisStore.close()

  return dumps
}

export { execute }
