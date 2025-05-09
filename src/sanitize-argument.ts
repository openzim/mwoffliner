import S3 from './S3.js'
import axios from 'axios'
import RedisStore from './RedisStore.js'
import { fileURLToPath } from 'url'
import pathParser from 'path'
import * as logger from './Logger.js'
import { config } from './config.js'
import fs from 'fs'
import { isValidEmail } from './util/index.js'
import * as path from 'path'
import { parameterDescriptions } from './parameterList.js'
import { RENDERERS_LIST } from './util/const.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const parametersWithArrayType = ['format']

export async function sanitize_all(argv: any) {
  // extracting all arguments
  const {
    articleList,
    addNamespaces,
    speed: _speed,
    adminEmail,
    mwUrl,
    customZimFavicon,
    optimisationCacheUrl,
    verbose,
    customZimLongDescription,
    customZimDescription,
    forceRender,
    mwWikiPath,
    mwIndexPhpPath,
    mwActionApiPath,
    mwRestApiPath,
    mwModulePath,
  } = argv

  sanitizeDoubleUsedParameters(argv)

  sanitize_articlesList_addNamespaces(articleList, addNamespaces)

  // sanitizing verbose
  sanitize_verbose(verbose)

  // sanitizing speed
  sanitize_speed(_speed)

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

  // sanitizing S3
  if (optimisationCacheUrl) {
    // Decompose the url with path and other S3 creds
    const s3UrlObj = new URL(optimisationCacheUrl)
    const s3Url = (s3UrlObj.protocol || 'https:') + '//' + (s3UrlObj.host || '') + (s3UrlObj.pathname || '')
    const s3Obj = new S3(s3Url, s3UrlObj.searchParams, 1000 * 60, argv.insecure)
    await s3Obj.initialise().then(() => {
      logger.log('Successfully logged in S3')
    })
  }

  // sanitizing mwUrl
  await sanitize_mwUrl(mwUrl)

  // sanitizing mwWikiPath
  if (mwWikiPath) {
    argv.mwWikiPath = sanitizeWikiPath(mwWikiPath)
  }

  // sanitizing mwIndexPhpPath
  if (mwIndexPhpPath) {
    argv.mwIndexPhpPath = sanitizeApiPathParam(mwIndexPhpPath)
  }

  // sanitizing mwRestApiPath
  if (mwRestApiPath) {
    argv.mwRestApiPath = sanitizeApiPathParam(mwRestApiPath)
  }

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
    argv.customMainPage = argv.customMainPage.replace(/ /g, '_')
  }

  // sanitizing adminEmail
  sanitize_adminEmail(adminEmail)

  // sanitizing renderer
  if (forceRender) {
    sanitize_forceRender(forceRender)
  }

  // Redis client sanitization
  // created a redis client and then closed it.
  sanitize_redis(argv)

  // sanitizing custom ZIM favicon
  if (customZimFavicon) {
    await sanitize_customZimFavicon(customZimFavicon)
  }
}

export function sanitizeWikiPath(mwWikiPath = '') {
  mwWikiPath = sanitizeApiPathParam(mwWikiPath)

  // Remove trailing $1 since we don't need it
  if (mwWikiPath?.endsWith('$1')) {
    mwWikiPath = mwWikiPath.substring(0, mwWikiPath.length - 3)
  }

  // Make sure wikiPath always has forward slash at the end for the correct URL building
  if (!mwWikiPath?.endsWith('/')) {
    mwWikiPath += '/'
  }

  return mwWikiPath
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

export function sanitize_verbose(verbose: logger.LogLevel | true) {
  if (verbose && verbose !== true && !logger.logLevels.includes(verbose)) {
    throw new Error(`"${verbose}" is not a valid value for option verbose. It should be empty or one of [info, log, warn, error, quiet].`)
  }
}

export function sanitize_articlesList_addNamespaces(articlesList: string, addNamespaces: string) {
  if (articlesList && addNamespaces) {
    throw new Error('options --articlesList and --addNamespaces cannot be used together')
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
  if (_speed && isNaN(_speed)) {
    throw new Error('speed is not a number, please give a number value to --speed.')
  }
}

export async function sanitize_mwUrl(mwUrl: string) {
  await axios.get(mwUrl).catch(() => {
    throw new Error(`mwUrl [${mwUrl}] is not valid.`)
  })
}

export function sanitize_adminEmail(adminEmail: any) {
  if (!isValidEmail(adminEmail)) {
    throw new Error(`Admin email [${adminEmail}] is not valid.`)
  }
}

export async function sanitize_redis(argv: any) {
  RedisStore.setOptions(argv.redis || config.defaults.redisPath)
  await RedisStore.connect(false)
  logger.log('closing sanitize redis DB')
  await RedisStore.close()
}

export async function sanitize_customZimFavicon(customZimFavicon: any) {
  const faviconIsRemote = customZimFavicon.includes('http')
  if (faviconIsRemote) {
    // make a download to check custom favicon link is valid
    await axios.get(customZimFavicon).catch(() => {
      throw new Error(`Failed to download custom ZIM favicon from [${customZimFavicon}]`)
    })
  } else {
    fs.readFileSync(customZimFavicon)
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

export function sanitize_forceRender(renderName: string): string {
  const checkRenderName = (arr: string[], val: string) => {
    return arr.some((arrVal) => val === arrVal)
  }
  if (checkRenderName(RENDERERS_LIST, renderName)) {
    return renderName
  }
  throw new Error(`Invalid render name: ${renderName}`)
}
