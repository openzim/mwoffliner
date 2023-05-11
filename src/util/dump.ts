import urlParser from 'url'
import * as pathParser from 'path'
import async from 'async'
import * as logger from '../Logger.js'
import axios from 'axios'
import Downloader from '../Downloader.js'
import { getFullUrl, jsPath, cssPath } from './index.js'
import { config } from '../config.js'
import MediaWiki from '../MediaWiki.js'
import { Creator as ZimCreator, StringItem } from '@openzim/libzim'
import { Dump } from '../Dump.js'
import fs from 'fs'
import { DO_PROPAGATION, ALL_READY_FUNCTION, WEBP_HANDLER_URL, LOAD_PHP, RULE_TO_REDIRECT } from './const.js'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function getAndProcessStylesheets(downloader: Downloader, redisStore: RS, links: Array<string | DominoElement>) {
  let finalCss = ''
  const { filesToDownloadXPath } = redisStore
  const stylesheetQueue = async.queue(async (link: string | DominoElement, finished) => {
    const cssUrl = typeof link === 'object' ? getFullUrl(link.getAttribute('href'), downloader.mw.baseUrl) : link
    const linkMedia = typeof link === 'object' ? link.getAttribute('media') : null
    try {
      /* link might be a 'link' DOM node or an URL */

      if (cssUrl && !cssUrl.match('^data')) {
        const cssUrlRegexp = new RegExp('url\\([\'"]{0,1}(.+?)[\'"]{0,1}\\)', 'gi')

        logger.info(`Downloading CSS from ${decodeURI(cssUrl)}`)
        const { content } = await downloader.downloadContent(cssUrl)
        const body = content.toString()

        let rewrittenCss = `\n/* start ${cssUrl} */\n\n`
        rewrittenCss += linkMedia ? `@media ${linkMedia}  {\n` : '\n'
        rewrittenCss += `${body}\n`
        rewrittenCss += linkMedia ? `} /* @media ${linkMedia} */\n` : '\n'
        rewrittenCss += `\n/* end   ${cssUrl} */\n`

        /* Downloading CSS dependencies */
        let match
        // tslint:disable-next-line:no-conditional-assignment
        while ((match = cssUrlRegexp.exec(body))) {
          let url = match[1]

          /* Avoid 'data', so no url dependency */
          if (!url.match('^data')) {
            const filePathname = urlParser.parse(url, false, true).pathname
            if (filePathname) {
              const filename = pathParser.basename(filePathname).replace(/-.*x./, '.')

              /* Rewrite the CSS */
              rewrittenCss = rewrittenCss.replace(url, filename)

              /* Need a rewrite if url doesn't include protocol */
              url = getFullUrl(url, cssUrl)
              url = url.indexOf('%') < 0 ? encodeURI(url) : url

              /* Download CSS dependency, but avoid duplicate calls */
              if (!downloader.cssDependenceUrls.hasOwnProperty(url) && filename) {
                downloader.cssDependenceUrls[url] = true
                filesToDownloadXPath.set(config.output.dirs.mediawiki + '/' + filename, { url: downloader.serializeUrl(url), namespace: '-' })
              }
            } else {
              logger.warn(`Skipping CSS [url(${url})] because the pathname could not be found [${filePathname}]`)
            }
          }
        }
        finalCss += rewrittenCss
        finished()
      }
    } catch (err) {
      logger.warn(`Failed to get CSS from [${cssUrl}]`)
      finished()
    }
  }, Number(downloader.speed))

  stylesheetQueue.push(links)

  return new Promise((resolve: any) => {
    stylesheetQueue.drain(resolve)
  }).then(() => {
    return {
      finalCss,
    }
  })
}

export async function downloadAndSaveModule(zimCreator: ZimCreator, mw: MediaWiki, downloader: Downloader, dump: Dump, module: string, type: 'js' | 'css') {
  const replaceCodeByRegex = (sourceText, replaceMap: Map<RegExp, string>) => {
    let text: string
    replaceMap.forEach((textToReplace, regEx) => {
      text = sourceText.replace(regEx, textToReplace)
    })
    return text
  }

  // the function hackStartupModule changes startup script by returning true for all modules so that load.php is not called.
  // it also removes requestIdleCallback as in our case window is idle after all script tags are called but those script tags
  // will require the functions which would have been loaded by doPropagation.
  function hackStartUpModule(jsCode: string) {
    if ((!ALL_READY_FUNCTION.test(jsCode) || !DO_PROPAGATION.test(jsCode)) && !LOAD_PHP.test(jsCode)) {
      throw new Error('unable to hack startup module')
    }
    return replaceCodeByRegex(
      jsCode,
      new Map([
        [DO_PROPAGATION, 'doPropagation();'],
        [ALL_READY_FUNCTION, 'function allReady( modules ) { return true;'],
        [LOAD_PHP, 'script.src ="";'],
      ]),
    )
  }

  let apiParameterOnly
  if (type === 'js') {
    apiParameterOnly = 'scripts'
  } else if (type === 'css') {
    apiParameterOnly = 'styles'
  }

  const moduleApiUrl = encodeURI(`${mw.modulePath}debug=true&lang=en&modules=${module}&only=${apiParameterOnly}&skin=vector&version=&*`)
  logger.info(`Getting [${type}] module [${moduleApiUrl}]`)

  const { content } = await downloader.downloadContent(moduleApiUrl)
  let text = content.toString()

  if (type === 'js') {
    switch (module) {
      case 'startap':
        text = hackStartUpModule(text)
        break
      case 'mediawiki.page.ready':
        text = replaceCodeByRegex(text, new Map([[RULE_TO_REDIRECT, 'false']]))
        break
    }
  }

  try {
    const articleId = type === 'js' ? jsPath(module, config.output.dirs.mediawiki) : cssPath(module, config.output.dirs.mediawiki)
    const mimeType = (type === 'js') ? 'application/javascript' : 'text/css';
    const item = new StringItem(articleId, mimeType, '', {}, text)
    await zimCreator.addItem(item)
    logger.info(`Saved module [${module}]`)
  } catch (e) {
    logger.error(`Failed to get module with url [${moduleApiUrl}]\nYou may need to specify a custom --mwModulePath`, e)
    throw e
  }
}

// URLs should be kept the same as Kiwix JS relies on it.
export async function importPolyfillModules(zimCreator: ZimCreator) {
  const polyfills = [
    { name: 'webpHeroPolyfill', path: path.join(__dirname, '../../node_modules/webp-hero/dist-cjs/polyfills.js') },
    { name: 'webpHeroBundle', path: path.join(__dirname, '../../node_modules/webp-hero/dist-cjs/webp-hero.bundle.js') },
  ]

  for(const { name, path } of polyfills) {
    const data = fs.readFileSync(path, 'utf8').toString()
    const item = new StringItem(jsPath(name), 'application/javascript', '', {}, data)
    await zimCreator.addItem(item);
  }

  const content = await axios
    .get(WEBP_HANDLER_URL, {
      responseType: 'arraybuffer',
      timeout: 60000,
      validateStatus(status) {
        return [200, 302, 304].indexOf(status) > -1
      },
    })
    .then((a) => a.data)
    .catch((err) => {
      throw new Error(`Failed to download webpHandler from [${WEBP_HANDLER_URL}]: ${err}`)
    })

  const item = new StringItem(jsPath('webpHandler'), '', '', {}, content)
  await zimCreator.addItem(item)
}
