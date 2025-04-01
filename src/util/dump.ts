import urlParser, { fileURLToPath } from 'url'
import * as pathParser from 'path'
import async from 'async'
import * as logger from '../Logger.js'
import Downloader from '../Downloader.js'
import RedisStore from '../RedisStore.js'
import { getFullUrl, jsPath, cssPath } from './index.js'
import { config } from '../config.js'
import MediaWiki from '../MediaWiki.js'
import { Creator, StringItem } from '@openzim/libzim'
import { Dump } from '../Dump.js'
import fs from 'fs'
import { DO_PROPAGATION, ALL_READY_FUNCTION, WEBP_HANDLER_URL, LOAD_PHP, RULE_TO_REDIRECT } from './const.js'
import * as path from 'path'
import urlHelper from './url.helper.js'
import { zimCreatorMutex } from '../mutex.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function getAndProcessStylesheets(downloader: Downloader, links: Array<string | DominoElement>) {
  let finalCss = ''
  const { filesToDownloadXPath } = RedisStore
  const stylesheetQueue = async.queue(async (link: string | DominoElement, finished) => {
    const cssUrl = typeof link === 'object' ? getFullUrl(link.getAttribute('href'), MediaWiki.baseUrl) : link
    const linkMedia = typeof link === 'object' ? link.getAttribute('media') : null
    try {
      /* link might be a 'link' DOM node or an URL */

      if (cssUrl && !cssUrl.match('^data')) {
        const cssUrlRegexp = new RegExp('url\\([\'"]{0,1}(.+?)[\'"]{0,1}\\)', 'gi')

        logger.info(`Downloading CSS from ${decodeURI(cssUrl)}`)
        const { content } = await downloader.downloadContent(cssUrl, 'css')
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

          /* Avoid 'data', so no URL dependency */
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
              // eslint-disable-next-line no-prototype-builtins
              if (!downloader.cssDependenceUrls.hasOwnProperty(url) && filename) {
                downloader.cssDependenceUrls[url] = true
                filesToDownloadXPath.set(config.output.dirs.mediawiki + '/' + filename, { url: urlHelper.serializeUrl(url), kind: 'media' })
              }
            } else {
              logger.warn(`Skipping CSS [url(${url})] because the pathname could not be found [${filePathname}]`)
            }
          }
        }
        finalCss += rewrittenCss
        finished()
      }
    } catch {
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

export async function downloadAndSaveModule(zimCreator: Creator, downloader: Downloader, dump: Dump, module: string, type: 'js' | 'css') {
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
  let moduleApiUrl: string
  if (type === 'js') {
    apiParameterOnly = 'scripts'
  } else if (type === 'css') {
    apiParameterOnly = 'styles'
  }

  if (!module.includes('javascript/mobile') && !module.includes('css/mobile')) {
    moduleApiUrl = encodeURI(`${MediaWiki.modulePath}debug=true&lang=en&modules=${module}&only=${apiParameterOnly}&skin=${MediaWiki.skin}&version=&*`)
  } else {
    moduleApiUrl = encodeURI(`https:${module}`)
  }

  logger.info(`Getting [${type}] module [${moduleApiUrl}]`)

  const { content } = await downloader.downloadContent(moduleApiUrl, 'module')
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

  // Zimcheck complains about empty files, and it is too late to decide to not create this file
  // since it has been referenced in all articles HTML, hence creating broken links if we do not
  // include this file in the ZIM, so let's create a minimal file content
  text = text || `/* ${module} is an empty file */`

  try {
    let articleId
    const pathFunctions = {
      js: jsPath,
      css: cssPath,
    }

    const pathFunction = pathFunctions[type]
    if (pathFunction) {
      articleId = pathFunction(module, config.output.dirs.mediawiki)
    }
    const mimetype = type === 'js' ? 'text/javascript' : 'text/css'
    await zimCreatorMutex.runExclusive(() => zimCreator.addItem(new StringItem(articleId, mimetype, '', {}, text)))
    logger.info(`Saved module [${module}]`)
  } catch (e) {
    logger.error(`Failed to get module with url [${moduleApiUrl}]\nYou may need to specify a custom --mwModulePath`, e)
    throw e
  }
}

// URLs should be kept the same as Kiwix JS relies on it.
export async function importPolyfillModules(downloader: Downloader, zimCreator: Creator) {
  ;[
    { name: 'webpHeroPolyfill', path: path.join(__dirname, '../../node_modules/webp-hero/dist-cjs/polyfills.js') },
    { name: 'webpHeroBundle', path: path.join(__dirname, '../../node_modules/webp-hero/dist-cjs/webp-hero.bundle.js') },
  ].forEach(async ({ name, path }) => {
    const item = new StringItem(jsPath(name), 'text/javascript', '', {}, fs.readFileSync(path, 'utf8').toString())
    await zimCreatorMutex.runExclusive(() => zimCreator.addItem(item))
  })

  const content = await downloader
    .request({ url: WEBP_HANDLER_URL, method: 'GET', ...downloader.arrayBufferRequestOptions })
    .then((a) => a.data)
    .catch((err) => {
      throw new Error(`Failed to download webpHandler from [${WEBP_HANDLER_URL}]: ${err}`)
    })

  const item = new StringItem(jsPath('webpHandler'), 'text/javascript', '', {}, content)
  await zimCreatorMutex.runExclusive(() => zimCreator.addItem(item))
}
