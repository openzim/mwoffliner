import crypto from 'crypto'
import domino from 'domino'
import Downloader from '../Downloader.js'
import countryLanguage from '@ladjs/country-language'
import fs from 'fs'
import path from 'path'
import { mkdirp } from 'mkdirp'
import os from 'os'
import pathParser from 'path'
import { Creator, StringItem } from '@openzim/libzim'
import { Config, config } from '../config.js'
import * as logger from '../Logger.js'
import {
  LATEX_IMAGE_URL_REGEX,
  FANDOM_IMAGE_URL_REGEX,
  IMAGE_THUMB_URL_REGEX,
  FIND_HTTP_REGEX,
  BITMAP_IMAGE_MIME_REGEX,
  IMAGE_MIME_REGEX,
  WEBP_CANDIDATE_IMAGE_MIME_TYPE,
} from './const.js'
import { fileURLToPath } from 'url'
import { AxiosError } from 'axios'
import { zimCreatorMutex } from '../mutex.js'

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
  const widthMatch = url.match(/[/-]([0-9]+)px-/)
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
  // Read fallbackLanguage first, so it initially populates the strings. Then, read the primary language file,
  // overridding default strings with the values from the primary language.
  for (const lang of [fallbackLanguage, language]) {
    try {
      const fileContents = fs.readFileSync(path.join(__dirname, `../../translation/${lang}.json`)).toString()
      const langStrings = JSON.parse(fileContents)
      delete langStrings['@metadata']
      strings = { ...strings, ...langStrings }
    } catch {
      logger.warn(`Couldn't find strings file for [${lang}]`)
    }
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

export async function saveStaticFiles(staticFiles: Set<string>, zimCreator: Creator) {
  try {
    staticFiles.forEach(async (file) => {
      const staticFilesContent = await readFilePromise(pathParser.resolve(__dirname, `../../res/${file}`))

      let zimPath: string
      let mimetype: string
      if (file.endsWith('.ttf')) {
        zimPath = anyPath('ttf', file)
        mimetype = 'font/ttf'
      } else if (file.endsWith('.svg')) {
        zimPath = anyPath('svg', file)
        mimetype = 'image/svg+xml'
      } else if (file.endsWith('.css')) {
        zimPath = cssPath(file)
        mimetype = 'text/css'
      } else {
        zimPath = jsPath(file)
        mimetype = 'application/javascript'
      }

      const article = new StringItem(`${config.output.dirs.res}/${zimPath}`, mimetype, null, { FRONT_ARTICLE: 0 }, staticFilesContent)
      await zimCreatorMutex.runExclusive(() => zimCreator.addItem(article))
    })
  } catch (err) {
    logger.error(err)
  }
}

export function getStaticFiles(jsStaticFiles: string[], cssStaticFiles: string[]): string[] {
  jsStaticFiles = jsStaticFiles.map((jsFile) => jsFile.concat('.js'))
  cssStaticFiles = cssStaticFiles.map((cssFile) => cssFile.concat('.css'))
  return jsStaticFiles.concat(cssStaticFiles)
}

export function anyPath(ext: string, path: string, subDirectory = '') {
  const regex = new RegExp(`(\\.${ext})?$`)
  return `${subDirectory ? `${subDirectory}/` : ''}${path.replace(regex, '')}.${ext}`
}
export function cssPath(css: string, subDirectory = '') {
  return anyPath('css', css, subDirectory)
}
export function jsPath(js: string, subDirectory = '') {
  const path = isNodeModule(js) ? normalizeModule(js) : js
  return `${subDirectory ? `${subDirectory}/` : ''}${path}.js`
}
export function genHeaderCSSLink(config: Config, css: string, articleId: string, subDirectory = '') {
  const slashesInUrl = articleId.split('/').length - 1
  const upStr = slashesInUrl ? '../'.repeat(slashesInUrl) : './'
  return `<link href="${upStr}${cssPath(css, subDirectory)}" rel="stylesheet" type="text/css"/>`
}
export function genHeaderScript(config: Config, js: string, articleId: string, subDirectory = '', attributes = '') {
  const slashesInUrl = articleId.split('/').length - 1
  const upStr = slashesInUrl ? '../'.repeat(slashesInUrl) : './'
  const path = isNodeModule(js) ? normalizeModule(js) : js
  return `<script ${attributes} src="${upStr}${jsPath(path, subDirectory)}"></script>`
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
  let filedir = ''

  // Image thumbs
  if ((parts = IMAGE_THUMB_URL_REGEX.exec(decodedUrl)) !== null) {
    // Remove trailing / in parts[4] if possible
    parts[4] = parts[4] ? parts[4].substring(0, parts[4].length - 1) : ''

    // Most common case
    if (!parts[4] || parts[4].length <= parts[6].length) {
      filename = parts[6]
    }

    // To handle /...px-thumbnail.jpg use case
    else {
      filename = parts[4] + (parts[7] || '')
    }

    filedir = parts[1]
  }

  // Latex (equations)
  else if ((parts = LATEX_IMAGE_URL_REGEX.exec(decodedUrl)) !== null) {
    filename = parts[2] + '.svg'
    filedir = parts[1]
  }

  // Fandom has even an other URL scheme
  else if ((parts = FANDOM_IMAGE_URL_REGEX.exec(decodedUrl)) !== null) {
    filename = parts[2]
    filedir = parts[1]
  }

  // Default behaviour (make a hash of the URL)
  else {
    filename = crypto.createHash('md5').update(decodedUrl).digest('hex') + path.extname(new URL(url).pathname)
  }

  if (filedir) {
    filedir = crypto.createHash('md5').update(filedir).digest('hex') + '/'
  }

  if (escape) {
    filename = encodeURIComponent(filename)
  }

  return `${config.output.dirs.assets}/${filedir}${filename}`
}

/**
 * This function extracts the title from an HTML string and returns it stripped of any HTML tags.
 *
 * @param {string} html - The `html` parameter is a string that represents an HTML document. The
 * function extracts the title of the document from this HTML string.
 *
 * @returns a string that represents the title of an HTML document with all HTML tags removed. If the
 * title cannot be found in the input HTML string, an empty string is returned.
 */
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

export function getRelativeFilePath(parentArticleId: string, fileBase: string) {
  const slashesInUrl = parentArticleId.split('/').length - 1
  const upStr = slashesInUrl ? '../'.repeat(slashesInUrl) : './'
  return upStr + fileBase
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
    // eslint-disable-next-line no-prototype-builtins
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

export function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_REGEX.test(mimeType)
}

export function isBitmapImageMimeType(mimeType: string): boolean {
  return BITMAP_IMAGE_MIME_REGEX.test(mimeType)
}

export function isWebpCandidateImageMimeType(content_type: string) {
  return WEBP_CANDIDATE_IMAGE_MIME_TYPE.test(content_type)
}

export function cleanupAxiosError(err: AxiosError) {
  return { name: err.name, message: err.message, url: err.config?.url, status: err.response?.status, responseType: err.config?.responseType, data: err.response?.data }
}

async function downloadListByUrl(url: string): Promise<string> {
  const fileName = url.split('/').slice(-1)[0]
  const { data: contentStream } = await Downloader.request({ url, method: 'GET', ...Downloader.streamRequestOptions })
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
          } catch {
            // URL is not valid. Continue processing
          }
          if (url && url.href) {
            try {
              item = await downloadListByUrl(url.href)
            } catch {
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

export function truncateUtf8Bytes(text: string, maxBytes: number) {
  // Truncate text to maxBytes bytes once encoded to UTF-8 ; takes into account multi-bytes characters, avoiding to split
  // in the middle of a character, trying to do this in an efficient manner with binary search
  const encoder = new TextEncoder()
  const encoded = encoder.encode(text)

  if (encoded.length <= maxBytes) {
    return text
  }

  // Binary search to find the maximum substring that fits in maxBytes
  let low = 0
  let high = text.length

  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    const slice = text.slice(0, mid)
    const sliceBytes = encoder.encode(slice).length

    if (sliceBytes <= maxBytes) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  return text.slice(0, low - 1)
}
