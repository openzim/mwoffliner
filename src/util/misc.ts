import crypto from 'crypto'
import domino from 'domino'
import { defaultStreamRequestOptions } from '../Downloader.js'
import countryLanguage from '@ladjs/country-language'
import fs from 'fs'
import path from 'path'
import mime from 'mime-types'
import mkdirp from 'mkdirp'
import os from 'os'
import pathParser from 'path'
import { Creator as ZimCreator, FileItem } from '@openzim/libzim'
import { Config, config } from '../config.js'
import * as logger from '../Logger.js'
import {
  LATEX_IMAGE_URL_REGEX,
  FANDOM_IMAGE_URL_REGEX,
  WIKIHIERO_IMAGE_URL_REGEX,
  IMAGE_THUMB_URL_REGEX,
  FIND_HTTP_REGEX,
  IMAGE_URL_REGEX,
  BITMAP_IMAGE_MIME_REGEX,
  IMAGE_MIME_REGEX,
  WEBP_CANDIDATE_IMAGE_MIME_TYPE,
} from './const.js'
import { fileURLToPath } from 'url'
import axios, { AxiosError } from 'axios'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let tmpDirectory = ''

export function isValidEmail(email: string) {
  const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  return emailRegex.test(email)
}

export function lcFirst(str: string) {
  str += ''
  const f = str.charAt(0).toLowerCase()
  return f + str.substr(1)
}

export function ucFirst(str: string) {
  str += ''
  const f = str.charAt(0).toUpperCase()
  return f + str.substr(1)
}

function _decodeURIComponent(uri: string) {
  try {
    return decodeURIComponent(uri)
  } catch (error) {
    logger.warn(error)
    return uri
  }
}
export { _decodeURIComponent as decodeURIComponent }

export function touch(paths: string[] | string) {
  const currentDate = Date.now()
  paths = paths instanceof Array ? paths : [paths]
  paths.forEach((path) => {
    fs.utimes(path, currentDate, currentDate, () => null)
  })
}

export function getFullUrl(url: string, baseUrl: URL | string) {
  return new URL(url, baseUrl).toString()
}

export function getSizeFromUrl(url: string) {
  let mult
  let width
  const widthMatch = url.match(/[\/-]([0-9]+)px-/)
  if (widthMatch) {
    width = Number(widthMatch[1])
  } else {
    const multMatch = url.match(/-([0-9.]+)x\./)
    if (multMatch) {
      mult = Number(multMatch[1])
    }
  }
  return { mult, width }
}

export function randomString(len: number) {
  let str = ''
  const charSet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < len; i += 1) {
    const randomPoz = Math.floor(Math.random() * charSet.length)
    str += charSet.substring(randomPoz, randomPoz + 1)
  }
  return str
}

export function mkdirPromise(path: string) {
  try {
    return mkdirp(path, { recursive: true })
  } catch (err) {
    return err
  }
}

export function writeFilePromise(path: string, content: string | Buffer, encoding: fs.EncodingOption = 'utf8') {
  return new Promise((resolve, reject) => {
    fs.writeFile(path, content, encoding, (err) => {
      if (err) {
        reject(err)
      } else {
        resolve(null)
      }
    })
  })
}

export function readFilePromise(path: string, encoding: fs.EncodingOption = 'utf8') {
  return new Promise<string | Buffer>((resolve, reject) => {
    fs.readFile(path, encoding, (err, content) => {
      if (err) {
        reject(err)
      } else {
        resolve(content)
      }
    })
  })
}

export function contains(arr: any[], value: any) {
  return arr.some((v) => v === value)
}

/*
 * Move 'from'.childNodes to 'to' adding them before 'beforeNode'
 * If 'beforeNode' is null, the nodes are appended at the end.
 */
export function migrateChildren(from: any, to: any, beforeNode: any) {
  if (beforeNode === undefined) {
    beforeNode = null
  }
  while (from.firstChild) {
    to.insertBefore(from.firstChild, beforeNode)
  }
}

export function getStringsForLang(language: string, fallbackLanguage = 'en') {
  let strings: { [id: string]: string } = {}
  try {
    strings = JSON.parse(fs.readFileSync(path.join(__dirname, `../../translation/${language}.json`)).toString())
  } catch (err) {
    logger.warn(`Couldn't find strings file for [${language}], falling back to [${fallbackLanguage}]`)
    strings = JSON.parse(fs.readFileSync(path.join(__dirname, `../../translation/${fallbackLanguage}.json`)).toString())
  }
  return strings
}

export function interpolateTranslationString(str: string, parameters: { [key: string]: string }) {
  let newString = str
  for (const key of Object.keys(parameters)) {
    newString = newString.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), parameters[key])
  }
  return newString
}

export function saveStaticFiles(config: Config, zimCreator: ZimCreator) {
  const cssPromises = config.output.cssResources.concat(config.output.mainPageCssResources).map(async (css) => {
    try {
      const cssFilePath = pathParser.resolve(__dirname, `../../res/${css}.css`)
      const item = new FileItem(cssPath(css), 'text/css', '', {}, cssFilePath)
      await zimCreator.addItem(item)
    } catch (error) {
      logger.warn(`Could not create ${css} file : ${error}`)
    }
  })

  const jsPromises = config.output.jsResources.map(async (js) => {
    try {
      const jsFilePath = pathParser.resolve(__dirname, `../../res/${js}.js`)
      const item = new FileItem(jsPath(js), 'application/javascript', '', {}, jsFilePath)
      await zimCreator.addItem(item)
    } catch (error) {
      logger.warn(`Could not create ${js} file : ${error}`)
    }
  })
  return Promise.all([...cssPromises, ...jsPromises])
}

export function cssPath(css: string, subDirectory = '') {
  return `${subDirectory ? `${subDirectory}/` : ''}${css.replace(/(\.css)?$/, '')}.css`
}
export function jsPath(js: string, subDirectory = '') {
  const path = isNodeModule(js) ? normalizeModule(js) : js
  return `${subDirectory ? `${config.output.dirs.mediawiki}/` : ''}${path.replace(/(\.js)?$/, '')}.js`
}
export function genHeaderCSSLink(config: Config, css: string, articleId: string, subDirectory = '') {
  const resourceNamespace = '-'
  const slashesInUrl = articleId.split('/').length - 1
  const upStr = '../'.repeat(slashesInUrl + 1)
  return `<link href="${upStr}${resourceNamespace}/${cssPath(css, subDirectory)}" rel="stylesheet" type="text/css"/>`
}
export function genHeaderScript(config: Config, js: string, articleId: string, subDirectory = '', attributes = '') {
  const resourceNamespace = '-'
  const slashesInUrl = articleId.split('/').length - 1
  const upStr = '../'.repeat(slashesInUrl + 1)
  const path = isNodeModule(js) ? normalizeModule(js) : js
  return `<script ${attributes} src="${upStr}${resourceNamespace}/${jsPath(path, subDirectory)}"></script>`
}
export function genCanonicalLink(config: Config, webUrl: string, articleId: string) {
  return `<link rel="canonical" href="${webUrl}${encodeURIComponent(articleId)}" />`
}

export function getDumps(format: boolean | boolean[]) {
  let dumps: any[]
  if (format) {
    if (format instanceof Array) {
      dumps = []
      format.forEach((value) => {
        dumps.push(value === true ? '' : value)
      })
    } else if (format !== true) {
      dumps = [format]
    }
  } else {
    dumps = ['']
  }
  return dumps
}

export function getIso3(langIso2: string): Promise<string> {
  return new Promise((resolve, reject) => {
    countryLanguage.getLanguage(langIso2, (error: any, language: KVS<any>) => {
      if (error || !language.iso639_3) {
        reject(error)
      } else {
        resolve(language.iso639_3 as string)
      }
    })
  })
}

/* Internal path/url functions */
export function getMediaBase(url: string, escape: boolean) {
  const decodedUrl = decodeURI(url)
  let parts
  let filename

  // Image thumbs
  if ((parts = IMAGE_THUMB_URL_REGEX.exec(decodedUrl)) !== null) {
    // Remove trailing / in parts[1] if possible
    parts[1] = parts[1] ? parts[1].substring(0, parts[1].length - 1) : ''

    // Most common case
    if (!parts[1] || parts[1].length <= parts[3].length) {
      filename = parts[3]
    }

    // To handle /...px-thumbnail.jpg use case
    else {
      filename = parts[1] + (parts[4] || '')
    }
  }

  // Latex (equations)
  else if ((parts = LATEX_IMAGE_URL_REGEX.exec(decodedUrl)) !== null) {
    filename = parts[1] + '.svg'
  }

  // WikiHiero hieroglyphs (betting there won't be a name conflict with main namespace pictures)
  else if ((parts = WIKIHIERO_IMAGE_URL_REGEX.exec(decodedUrl)) !== null) {
    filename = parts[1]
  }

  // Fandom has even an other URL scheme
  else if ((parts = FANDOM_IMAGE_URL_REGEX.exec(decodedUrl)) !== null) {
    filename = parts[1]
  }

  // Default behaviour (make a hash of the URL)
  else {
    filename = crypto.createHash('md5').update(decodedUrl).digest('hex') + path.extname(new URL(url).pathname)
  }

  return escape ? encodeURIComponent(filename) : filename
}

export function getStrippedTitleFromHtml(html: string) {
  let [, , title = ''] = html.match(/<title( [^>]*)?>(.*)<[/]title>/i) || []
  if (!title) {
    const doc = domino.createDocument(html)
    const titleEl = doc.querySelector('title')
    title = titleEl ? titleEl.textContent : ''
  }
  return title.replace(/<[^>]*>?/gm, '')
}

export function zip(...args: any[][]) {
  const len = Math.max(...args.map((arr) => arr.length))
  return ','
    .repeat(len)
    .split(',')
    .map((_, i) => {
      return args.map((arr) => arr[i])
    })
}

export function deDup<T>(_arr: T[], getter: (o: T) => any) {
  const arr = _arr.sort((a, b) => (getter(a) < getter(b) ? -1 : 1))
  return arr.filter((item, index, arr) => {
    if (index + 1 === arr.length) {
      return true
    }
    return getter(item) !== getter(arr[index + 1])
  })
}

export function getRelativeFilePath(parentArticleId: string, fileBase: string, resourceNamespace: 'I' | 'A' | 'M' | '-') {
  const slashesInUrl = parentArticleId.split('/').length - 1
  const upStr = '../'.repeat(slashesInUrl + 1)
  const newUrl = `${upStr}${resourceNamespace}/` + fileBase
  return newUrl
}

export function normalizeModule(path: string) {
  return path.replace('../node_modules', 'node_module')
}

export function isNodeModule(path: string) {
  return path.startsWith('../node_module')
}

export function objToQueryString(obj: KVS<any>): string {
  const str = []
  for (const p in obj) {
    if (obj.hasOwnProperty(p) && typeof obj[p] !== 'undefined') {
      str.push(encodeURIComponent(p) + '=' + encodeURIComponent(obj[p]))
    }
  }
  return str.join('&')
}

export function sanitizeString(str: string) {
  return str.replace(/[&<>"'*=//]/g, ' ')
}

// We will need the encoded URL on article load so that we can set the hrefs of anchor tag correctly,
// but we must not encode the '/' character or else relative links may fail
export function encodeArticleIdForZimHtmlUrl(articleId: string) {
  return articleId && encodeURIComponent(articleId.startsWith('/') ? `./${articleId}` : articleId).replace(/%2F/g, '/')
}

export function ensureTrailingChar(input: string, trailingChar: string) {
  const pattern = `([^\\${trailingChar}])$`
  const rx = new RegExp(pattern)
  return input.replace(rx, '$1' + trailingChar)
}

export function stripHttpFromUrl(url: string): string {
  return url.replace(FIND_HTTP_REGEX, '')
}

export function isImageUrl(url: string): boolean {
  return IMAGE_URL_REGEX.test(url)
}

export function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_REGEX.test(mimeType)
}

export function isBitmapImageMimeType(mimeType: string): boolean {
  return BITMAP_IMAGE_MIME_REGEX.test(mimeType)
}

export function isWebpCandidateImageMimeType(webp: boolean, content_type: string) {
  return webp && WEBP_CANDIDATE_IMAGE_MIME_TYPE.test(content_type)
}

/*
 * Get best fitting MIME type from contentType or pathname
 * Preference:
 *   1. content-type if one of preferedDiscreteTypes
 *   2. mime-type from extension if in preferedDiscreteTypes
 *   3. any other content-type
 *   4. any other mime-type from extension
 *   5. null
 */
export function getMimeType(url: string, contentType?: string): string {
  const preferedDiscreteTypes = ['image', 'audio', 'video']

  let cMimeType: string
  if (contentType) {
    // i.e. "application/json; charset=utf-8"
    cMimeType = contentType.indexOf(';') === -1 ? contentType : contentType.slice(0, contentType.indexOf(';'))
    cMimeType = cMimeType.trim()

    const discreteType = cMimeType.slice(0, cMimeType.indexOf('/'))
    if (preferedDiscreteTypes.includes(discreteType)) {
      return cMimeType
    }
  }

  let pMimeType: string
  if (url) {
    // provide a bas url for parsing relative paths
    let { pathname } = new URL(url, 'http://large.com/path/to/strip/here')

    // Fandom has an URL scheme that attaches /revision/... to the path
    const parts = FANDOM_IMAGE_URL_REGEX.exec(pathname)
    if (parts !== null) {
      pathname = parts[1]
    }

    pMimeType = mime.lookup(pathname)
    if (pMimeType) {
      const discreteType = pMimeType.slice(0, pMimeType.indexOf('/'))
      if (preferedDiscreteTypes.includes(discreteType)) {
        return pMimeType
      }
    }
  }

  return cMimeType || pMimeType || null
}

export function cleanupAxiosError(err: AxiosError) {
  return { name: err.name, message: err.message, url: err.config?.url, status: err.response?.status, responseType: err.config?.responseType, data: err.response?.data }
}

async function downloadListByUrl(url: string): Promise<string> {
  const fileName = url.split('/').slice(-1)[0]
  const { data: contentStream } = await axios.get(url, defaultStreamRequestOptions)
  const filePath = path.join(await getTmpDirectory(), fileName)
  const writeStream = fs.createWriteStream(filePath)
  await new Promise((resolve, reject) => {
    contentStream
      .pipe(writeStream)
      .on('error', (err: any) => reject(err))
      .on('close', resolve)
  })
  return filePath
}

export async function extractArticleList(articleList: string): Promise<string[]> {
  const list = await Promise.all(
    articleList
      .split(',')
      .filter((n) => n)
      .map(async (part) => {
        let item: string | string[] = part.trim()
        if (item.indexOf('http') === 0) {
          let url: URL
          try {
            url = new URL(item)
          } catch (e) {
            // URL is not valid. Continue processing
          }
          if (url && url.href) {
            try {
              item = await downloadListByUrl(url.href)
            } catch (e) {
              throw new Error(`Failed to read articleList from URL: ${url.href}`)
            }
          }
        }
        if (fs.existsSync(item)) {
          item = fs
            .readFileSync(item)
            .toString()
            .split('\n')
            .map((a) => a.replace(/\r/gm, ''))
            .filter((a) => a)
        }
        return item
      }),
  )
  return list.flat(1)
}

export async function getTmpDirectory() {
  if (!tmpDirectory) {
    tmpDirectory = path.resolve(os.tmpdir(), `mwoffliner-${Date.now()}`)
    try {
      logger.info(`Creating temporary directory [${tmpDirectory}]`)
      await mkdirPromise(tmpDirectory)
    } catch (err) {
      logger.error('Failed to create temporary directory, exiting', err)
      throw err
    }
  }
  return tmpDirectory
}
