import { fileURLToPath } from 'url'
import * as pathParser from 'path'
import * as logger from '../Logger.js'
import Downloader from '../Downloader.js'
import RedisStore from '../RedisStore.js'
import { getFullUrl, jsPath, cssPath, getRelativeFilePath } from './index.js'
import { config } from '../config.js'
import MediaWiki from '../MediaWiki.js'
import { Creator, StringItem } from '@openzim/libzim'
import fs from 'fs'
import { DO_PROPAGATION, ALL_READY_FUNCTION, LOAD_PHP, RULE_TO_REDIRECT } from './const.js'
import * as path from 'path'
import urlHelper from './url.helper.js'
import { zimCreatorMutex } from '../mutex.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function processStylesheetContent(cssUrl: string, linkMedia: string, body: string, articleId?: string) {
  // articleId is supposed to be passed only when we rewrite inline CSS for a given article and we hence have
  // to compute relative path to assets

  const { filesToDownloadXPath } = RedisStore
  const cssUrlRegexp = new RegExp('url\\([\'"]{0,1}(.+?)[\'"]{0,1}\\)', 'gi')

  let rewrittenCss = `\n/* start ${cssUrl} */\n\n`
  rewrittenCss += linkMedia ? `@media ${linkMedia}  {\n` : '\n'
  rewrittenCss += `${body}\n`
  rewrittenCss += linkMedia ? `} /* @media ${linkMedia} */\n` : '\n'
  rewrittenCss += `\n/* end   ${cssUrl} */\n`

  /* Downloading CSS dependencies */
  let match: any
  // tslint:disable-next-line:no-conditional-assignment
  while ((match = cssUrlRegexp.exec(body))) {
    let url = match[1]

    /* Avoid 'data', so no URL dependency */
    if (!url.match('^data')) {
      const filePathname = new URL(url, cssUrl).pathname
      if (filePathname) {
        const filename = pathParser.basename(filePathname).replace(/-.*x./, '.')

        /* Rewrite the CSS */
        const relativePath = articleId ? getRelativeFilePath(articleId, `${config.output.dirs.mediawiki}/${filename}`) : filename
        rewrittenCss = rewrittenCss.replace(url, relativePath)

        /* Need a rewrite if url doesn't include protocol */
        url = getFullUrl(url, cssUrl)
        url = url.indexOf('%') < 0 ? encodeURI(url) : url

        /* Download CSS dependency, but avoid duplicate calls */
        // eslint-disable-next-line no-prototype-builtins
        if (!Downloader.cssDependenceUrls.hasOwnProperty(url) && filename) {
          Downloader.cssDependenceUrls[url] = true
          filesToDownloadXPath.set(config.output.dirs.mediawiki + '/' + filename, { url: urlHelper.serializeUrl(url), kind: 'media' })
        }
      } else {
        logger.warn(`Skipping CSS [url(${url})] because the pathname could not be found [${filePathname}]`)
      }
    }
  }

  return rewrittenCss
}

export async function downloadModule(module: string, type: 'js' | 'css') {
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

  const moduleLang = MediaWiki.metaData?.langVar || MediaWiki.metaData?.langMw || 'en'
  let apiParameterOnly
  let moduleApiUrl: string
  if (type === 'js') {
    apiParameterOnly = 'scripts'
  } else if (type === 'css') {
    apiParameterOnly = 'styles'
  }

  if (!module.includes('javascript/mobile') && !module.includes('css/mobile')) {
    moduleApiUrl = encodeURI(`${MediaWiki.modulePath}lang=${moduleLang}&modules=${module}&only=${apiParameterOnly}&skin=${MediaWiki.skin}`)
  } else {
    moduleApiUrl = encodeURI(`https:${module}`)
  }

  logger.info(`Getting [${type}] module [${moduleApiUrl}]`)

  const { content } = await Downloader.downloadContent(moduleApiUrl, 'module')
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

  if (type === 'css') {
    text = processStylesheetContent(moduleApiUrl, '', text, '')
  }

  // Zimcheck complains about empty files, and it is too late to decide to not create this file
  // since it has been referenced in all articles HTML, hence creating broken links if we do not
  // include this file in the ZIM, so let's create a minimal file content
  text = text || `/* ${module} is an empty file */`

  return { text, moduleApiUrl }
}

export async function downloadAndSaveModule(zimCreator: Creator, module: string, type: 'js' | 'css') {
  const { text, moduleApiUrl } = await downloadModule(module, type)

  try {
    if (!['js', 'css'].includes(type)) {
      throw new Error(`Unsupported module type: ${type}`)
    }
    const modulePath = type === 'js' ? jsPath(module, config.output.dirs.mediawiki) : cssPath(module, config.output.dirs.mediawiki)
    const mimetype = type === 'js' ? 'text/javascript' : 'text/css'
    await zimCreatorMutex.runExclusive(() => zimCreator.addItem(new StringItem(modulePath, mimetype, null, { FRONT_ARTICLE: 0 }, text)))
    logger.info(`Saved module [${module}] at ${modulePath}`)
  } catch (e) {
    logger.error(`Failed to get module with url [${moduleApiUrl}]\nYou may need to specify a custom --mwModulePath`, e)
    throw e
  }
}

// URLs should be kept the same as Kiwix JS relies on it.
export async function addWebpJsScripts(zimCreator: Creator) {
  ;[
    { name: 'webpHeroPolyfill', path: path.join(__dirname, '../../node_modules/webp-hero/dist-cjs/polyfills.js') },
    { name: 'webpHeroBundle', path: path.join(__dirname, '../../node_modules/webp-hero/dist-cjs/webp-hero.bundle.js') },
    { name: 'webpHandler', path: path.join(__dirname, '../../res/webpHandler.js') },
  ].forEach(async ({ name, path }) => {
    const item = new StringItem(`${config.output.dirs.webp}/${jsPath(name)}`, 'text/javascript', null, { FRONT_ARTICLE: 0 }, fs.readFileSync(path, 'utf8').toString())
    await zimCreatorMutex.runExclusive(() => zimCreator.addItem(item))
  })
}
