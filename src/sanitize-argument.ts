import S3 from './S3.js'
import RedisStore from './RedisStore.js'
import { fileURLToPath, URL } from 'url'
import pathParser from 'path'
import * as logger from './Logger.js'
import fs from 'fs'
import { isValidEmail } from './util/index.js'
import * as path from 'path'
import { parameterDescriptions } from './parameterList.js'
import { RENDERERS_LIST } from './util/const.js'
import Downloader from './Downloader.js'
import MediaWiki from './MediaWiki.js'
import { config } from './config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const parametersWithArrayType = ['format', 'langVariant']

// Perform "static check" of arguments not depending on external connectivity
// Stack is not yet sufficiently ready to perform live external connectivity checks
export async function sanitize_all(argv: any) {
  // extracting all arguments
  const {
    pageList,
    addNamespaces,
    onlyNamespaces,
    speed,
    adminEmail,
    mwUrl,
    logLevel,
    customZimLongDescription,
    customZimDescription,
    customZimName,
    customZimFilename,
    forceRender,
    javaScript,
    addModules,
    langVariant,
    mwActionApiPath,
    mwModulePath,
    categoriesPageSize,
    mathJaxSource,
    mathJaxConfig,
    mathJaxEntryPoint,
  } = argv

  sanitizeDoubleUsedParameters(argv)

  sanitize_customName_langVariant(customZimName, customZimFilename, langVariant)

  sanitizePageSelection(pageList, addNamespaces, onlyNamespaces)

  // sanitizing logLevel
  sanitize_logLevel(logLevel)

  // sanitizing speed
  sanitize_speed(speed)

  sanitizeCategoriesPageSize(categoriesPageSize)

  // sanitizing longDescription
  sanitizeStringMaxLength(customZimLongDescription, 'customZimLongDescription', 4000)

  // sanitizing description
  sanitizeStringMaxLength(customZimDescription, 'customZimDescription', 80)

  // sanitizing custom flavour
  if (argv.customFlavour) {
    argv.customFlavour = sanitize_customFlavour(argv.customFlavour)
    if (!argv.customFlavour) {
      throw new Error('Custom Flavour not found')
    }
  }

  // sanitizing javaScript
  sanitize_javaScript_addModules(javaScript, addModules)

  // sanitizing mwActionApiPath
  if (mwActionApiPath) {
    argv.mwActionApiPath = sanitizeApiPathParam(mwActionApiPath)
  }

  // sanitizing mwModulePath
  if (mwModulePath) {
    argv.mwModulePath = sanitizeApiPathParam(mwModulePath)
  }

  // sanitize Custom Main Page
  if (argv.customMainPage) {
    argv.customMainPage = argv.customMainPage.replace(/_/g, ' ')
  }

  if (!mwUrl || mwUrl.trim() === '') {
    throw new Error('Option --mwUrl is required and cannot be empty')
  }

  if (!adminEmail || adminEmail.trim() === '') {
    throw new Error('Option --adminEmail is required and cannot be empty')
  }

  //sanitizing mwUrl
  sanitize_mwUrl(mwUrl)
  // sanitizing adminEmail
  sanitize_adminEmail(adminEmail)

  // sanitizing renderer
  if (forceRender) {
    sanitize_forceRender(forceRender)
  }

  // sanitizing MathJax options
  sanitize_mathJax(mathJaxSource, mathJaxConfig, mathJaxEntryPoint)
}

// perform live checks of arguments needing a connection "somewhere"
export async function check_all(argv: any) {
  // extracting required arguments
  const { mwUrl, mwActionApiPath, customZimFavicon, optimisationCacheUrl, insecure } = argv

  // check mediawiki API availability
  await check_mwApiReachability(mwUrl, mwActionApiPath)

  // check s3 availability
  await check_s3(optimisationCacheUrl, insecure)

  // Check Redis availability
  // created a redis client and then closed it.
  await check_redis()

  // check custom ZIM favicon availability
  if (customZimFavicon) {
    await check_customZimFavicon(customZimFavicon)
  }
}

export function sanitizeApiPathParam(apiPathParam: string) {
  if (!apiPathParam) {
    return
  }

  // All API path must start with a forward slash
  if (!apiPathParam?.startsWith('/')) {
    apiPathParam = '/' + apiPathParam
  }

  return apiPathParam
}

export function sanitizeStringMaxLength(text: string, key: string, length: number) {
  if (text && text.length > length) {
    throw new Error(`${key} should be less than ${length} characters.`)
  }
}

export function sanitize_logLevel(logLevel: string | undefined) {
  if (logLevel !== undefined && !logger.logLevels.includes(logLevel as logger.LogLevel)) {
    throw new Error(`"${logLevel}" is not a valid value for option --log-level. It should be one of [${logger.logLevels.join(', ')}].`)
  }
}

export function sanitize_customName_langVariant(customZimName: string, customZimFilename: string, langVariant: string | string[]) {
  if (customZimName && Array.isArray(langVariant) && !customZimName.includes('{lang_or_variant}')) {
    throw new Error('option --customZimName needs to include the {lang_or_variant} placeholder when using multiple --langVariant')
  }
  if (customZimFilename && Array.isArray(langVariant) && !customZimFilename.includes('{lang_or_variant}')) {
    throw new Error('option --customZimFilename needs to include the {lang_or_variant} placeholder when using multiple --langVariant')
  }
}

export function sanitizePageSelection(pageList: string, addNamespaces: string, onlyNamespaces: string) {
  if (pageList && addNamespaces) {
    throw new Error('options --pageList and --addNamespaces cannot be used together')
  }
  if (pageList && onlyNamespaces) {
    throw new Error('options --pageList and --onlyNamespaces cannot be used together')
  }
  if (addNamespaces && onlyNamespaces) {
    throw new Error('options --addNamespaces and --onlyNamespaces cannot be used together')
  }
}

export function sanitizeDoubleUsedParameters(options: object) {
  const parameterKeys = Object.keys(parameterDescriptions)
  for (const [optionKey, optionValue] of Object.entries(options)) {
    if (parameterKeys.includes(optionKey) && !parametersWithArrayType.includes(optionKey) && Array.isArray(optionValue)) {
      throw new Error(`Parameter '--${optionKey}' can only be used once`)
    }
  }
}

export function sanitize_speed(_speed: any) {
  if (_speed !== undefined && _speed !== null) {
    const numSpeed = Number(_speed)
    if (isNaN(numSpeed) || numSpeed <= 0) {
      throw new Error('speed must be a positive number. Values >= 1 set the number of parallel workers (integer). Values < 1 slow down the scraper.')
    }
    if (numSpeed >= 1 && !Number.isInteger(numSpeed)) {
      throw new Error('speed values >= 1 must be integers (number of parallel workers).')
    }
  }
}

export function sanitizeCategoriesPageSize(categoriesPageSize: any) {
  if (categoriesPageSize !== undefined && categoriesPageSize !== null) {
    const numCategoriesPageSize = Number(categoriesPageSize)
    if (isNaN(numCategoriesPageSize)) {
      throw new Error('categoriesPageSize must be a number.')
    }
    if (numCategoriesPageSize <= 0) {
      throw new Error('categoriesPageSize must be a positive.')
    }
    if (!Number.isInteger(numCategoriesPageSize)) {
      throw new Error('categoriesPageSize must be integer.')
    }
  }
}

export function sanitize_javaScript_addModules(javaScript: any, addModules: any) {
  if (javaScript && !['none', 'trusted', 'all'].includes(javaScript)) {
    throw new Error(`"${javaScript}" is not a valid value for option javaScript. It should be empty or one of [none, trusted, all].`)
  }
  if (javaScript === 'none' && addModules) {
    throw new Error('options --javaScript=none and --addModules cannot be used together')
  }
}

export async function check_mwApiReachability(mwUrl: string, mwActionApiPath: string) {
  // We are building an API query "by-hand" because we've not yet initialized the whole URL director / URL builder stack
  const apiQueryUrl = `${new URL(mwActionApiPath || MediaWiki.actionApiPath, mwUrl).toString()}?action=query&format=json&formatversion=2&maxlag=${config.defaults.maxlag}`
  const value = await Downloader.get(apiQueryUrl).catch((err) => {
    throw new Error(`Mediawiki API is not reachable with ${apiQueryUrl}\n${err}\nYou may need to pass a (different) value for --mwActionApiPath, see the FAQ.`)
  })
  const contentType = value.headers['content-type']
  if (!(contentType as string).includes('application/json')) {
    throw new Error(`Mediawiki API is returning '${contentType}' Content-Type instead of 'application/json' with ${apiQueryUrl}`)
  }
}

export function sanitize_mwUrl(mwUrl: string) {
  let url: URL
  try {
    url = new URL(mwUrl)
  } catch {
    throw new Error(`mwUrl is not a valid URL.`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`mwUrl must use http or https protocol, got '${url.protocol.replace(':', '')}'.`)
  }

  if (url.pathname !== '/') {
    throw new Error(`mwUrl must not contain a path (only the hostname is expected), got '${url.pathname}'. See the FAQ.`)
  }
}

export function sanitize_adminEmail(adminEmail: any) {
  if (!isValidEmail(adminEmail)) {
    throw new Error(`Admin email [${adminEmail}] is not valid.`)
  }
}

export async function check_redis() {
  await RedisStore.connect(false)
  logger.info('closing sanitize redis DB')
  await RedisStore.close()
}

export async function check_customZimFavicon(customZimFavicon: any) {
  const faviconIsRemote = customZimFavicon.includes('http')
  if (faviconIsRemote) {
    // make a download to check custom favicon link is valid
    await Downloader.get(customZimFavicon).catch(() => {
      throw new Error(`Failed to download custom ZIM favicon from [${customZimFavicon}]`)
    })
  } else {
    fs.readFileSync(customZimFavicon)
  }
}

export async function check_s3(optimisationCacheUrl: string, insecure: boolean) {
  // sanitizing S3
  if (optimisationCacheUrl) {
    // Decompose the url with path and other S3 creds
    const s3UrlObj = new URL(optimisationCacheUrl)
    const s3Url = (s3UrlObj.protocol || 'https:') + '//' + (s3UrlObj.host || '') + (s3UrlObj.pathname || '')
    const s3Obj = new S3(s3Url, s3UrlObj.searchParams, 1000 * 60, insecure)
    await s3Obj.initialise().then(() => {
      logger.info('Successfully logged in S3')
    })
  }
}

/**
 * Search for the customFlavour in the following order
 *
 * 1. Current directory in which command has been run
 * 2. mwoffliner's extensions directory
 * 3. absolute path(for root folder)
 *
 * Note: CustomFlavour doesn't necessarily need be given with extension(.js)
 * like --customFlavour=wiktionary_fr. Hence, .js is explicitly added for
 * path resolution.
 */

export function sanitize_customFlavour(customFlavour: string): string {
  customFlavour += pathParser.extname(customFlavour) !== '.js' ? '.js' : ''
  return (
    [pathParser.resolve(customFlavour), pathParser.resolve(__dirname, `../extensions/${customFlavour}`), customFlavour].find(function (possiblePath) {
      return fs.existsSync(possiblePath)
    }) || null
  )
}

export function sanitize_mathJax(mathJaxSource: any, mathJaxConfig: any, mathJaxEntryPoint: any) {
  if (mathJaxConfig && !mathJaxSource) {
    throw new Error('Option --mathJaxConfig requires --mathJaxSource to also be set')
  }
  if (mathJaxEntryPoint && !mathJaxSource) {
    throw new Error('Option --mathJaxEntryPoint requires --mathJaxSource to also be set')
  }
}

export function sanitize_forceRender(renderName: string): string {
  const checkRenderName = (arr: string[], val: string) => {
    return arr.some((arrVal) => val === arrVal)
  }
  if (checkRenderName(RENDERERS_LIST, renderName)) {
    return renderName
  }
  throw new Error(`Invalid render name: ${renderName}`)
}
