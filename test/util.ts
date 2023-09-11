import MediaWiki from '../src/MediaWiki.js'
import Downloader from '../src/Downloader.js'
import { Dump } from '../src/Dump.js'
import { config } from '../src/config.js'
import axios from 'axios'
import { execa } from 'execa'
import * as logger from '../src/Logger.js'
import 'dotenv/config.js'

export function leftPad(_num: number, length: number) {
  const num = `${_num}`
  return '0'.repeat(length - num.length) + num
}

export function makeLink($doc: Document, href: string, rel: string, title: string, text: string = href, attributes: KVS<string> = {}) {
  const $link = $doc.createElement('a')
  $link.setAttribute('href', href)
  $link.setAttribute('rel', rel)
  $link.setAttribute('title', title)
  $link.innerHTML = text

  for (const [key, value] of Object.entries(attributes)) {
    $link.setAttribute(key, value)
  }

  const $wrapper = $doc.createElement('div')
  $wrapper.appendChild($link)
  $doc.body.appendChild($wrapper)

  return $link
}

export async function setupScrapeClasses({ mwUrl = 'https://en.wikipedia.org', format = '' } = {}) {
  MediaWiki.base = mwUrl

  const downloader = new Downloader({ uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: false, optimisationCacheUrl: '' })

  await MediaWiki.getMwMetaData(downloader)
  await MediaWiki.hasCoordinates(downloader)
  await MediaWiki.hasWikimediaDesktopRestApi()
  await MediaWiki.hasWikimediaMobileRestApi()
  await MediaWiki.hasVisualEditorApi()

  const dump = new Dump(format, {} as any, MediaWiki.metaData)

  return {
    MediaWiki,
    downloader,
    dump,
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const zimcheckPath = process.env.ZIMCHECK_PATH || 'zimcheck'
export async function zimcheckAvailable() {
  try {
    await execa(`which ${zimcheckPath}`, { shell: true })
    return true
  } catch (err) {
    return false
  }
}

export async function zimcheck(filePath: string) {
  return execa(`${zimcheckPath} ${filePath}`, { shell: true })
}

const zimdumpPath = process.env.ZIMDUMP_PATH || 'zimdump'
export async function zimdumpAvailable(): Promise<boolean> {
  try {
    await execa(`which ${zimdumpPath}`, { shell: true })
    return true
  } catch (err) {
    return false
  }
}

export async function zimdump(params: string): Promise<string> {
  return execa(`${zimdumpPath} ${params}`, { shell: true }).then(({ stdout }) => stdout)
}

export async function convertWikicodeToHtml(wikicode: string, baseUrl: string): Promise<any> {
  try {
    return await axios.post(`${baseUrl}api/rest_v1/transform/wikitext/to/html`, {
      wikitext: wikicode,
      body_only: true,
    })
  } catch (err) {
    logger.log(`Got error during conversion of wikicode to HTML due to ${err}`)
    return err
  }
}

export async function testHtmlRewritingE2e(wikicode: string, html: string) {
  const resultHtml = await convertWikicodeToHtml(wikicode, 'https://en.wikipedia.org/')
  expect(html).toEqual(resultHtml.data)
}
