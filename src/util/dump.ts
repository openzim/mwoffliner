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
import { RULE_TO_REDIRECT } from './const.js'
import * as path from 'path'
import urlHelper from './url.helper.js'
import { zimCreatorMutex } from '../mutex.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function processStylesheetContent(cssUrl: string, linkMedia: string, body: string, articleId?: string, isJs?: boolean) {
  // articleId is supposed to be passed only when we rewrite inline CSS for a given article and we hence have
  // to compute relative path to assets

  const { filesToDownloadXPath } = RedisStore
  const cssUrlRegexp = new RegExp('url\\([\'"]{0,1}(.*?)[\'"]{0,1}\\)', 'gi')

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
    if (url && !url.match('^data')) {
      const filePathname = new URL(url, cssUrl).pathname
      if (filePathname) {
        const filename = pathParser.basename(filePathname).replace(/-.*x./, '.')

        /* Rewrite the CSS */
        const relativePath = articleId
          ? getRelativeFilePath(articleId, `${config.output.dirs.mediawiki}/${filename}`)
          : isJs
            ? `__RELATIVE_FILE_PATH__${config.output.dirs.mediawiki}/${filename}`
            : filename
        rewrittenCss = rewrittenCss.replace(url, relativePath)

        /* Need a rewrite if url doesn't include protocol */
        url = getFullUrl(url, cssUrl)
        url = url.indexOf('%') < 0 ? encodeURI(url) : url

        let decodedFilename = filename
        if (filename.indexOf('%') >= 0) {
          try {
            decodedFilename = decodeURIComponent(filename)
          } catch {
            decodedFilename = filename
          }
        }

        /* Download CSS dependency, but avoid duplicate calls */
        // eslint-disable-next-line no-prototype-builtins
        if (!Downloader.cssDependenceUrls.hasOwnProperty(url) && decodedFilename) {
          Downloader.cssDependenceUrls[url] = true
          filesToDownloadXPath.set(config.output.dirs.mediawiki + '/' + decodedFilename, { url: urlHelper.serializeUrl(url), kind: 'media' })
        }
      } else {
        logger.warn(`Skipping CSS [url(${url})] because the pathname could not be found [${filePathname}]`)
      }
    }
  }

  return rewrittenCss
}

export async function downloadModule(module: string, type: 'js' | 'css') {
  const replaceCodeByRegex = (sourceText: string, replaceMap: Map<RegExp, string>) => {
    let text = sourceText
    replaceMap.forEach((textToReplace, regEx) => {
      text = text.replace(regEx, textToReplace)
    })
    return text
  }

  // the function hackStartupModule changes startup script by returning true for all modules so that load.php is not called.
  // it also removes requestIdleCallback as in our case window is idle after all script tags are called but those script tags
  // will require the functions which would have been loaded by doPropagation.
  function hackStartUpModule(jsCode: string) {
    return replaceCodeByRegex(
      jsCode,
      new Map([
        // Load modules one at a time
        [/,maxQueryLength:\d+,/, ',maxQueryLength:0,'],
        // Load modules from the ZIM
        [
          /addScript\(sourceLoadScript\+'\?'\+makeQueryString\(query\),null,packed\.list\);/,
          'addScript(RLCONF.zimRelativeFilePath+"' + jsPath('"+query.modules+"', config.output.dirs.mediawiki) + '",null,packed.list);',
        ],
        // Load modules from local storage with source like from the ZIM
        [
          /srcParts\.push\('\/\/# sourceURL=',\(new URL\(sourceLoadScript,location\)\)\.href,'\?',makeQueryString\(query\),'\n'\);/,
          'srcParts.push("//# sourceURL=",RLCONF.zimRelativeFilePath,"' + jsPath('"+query.modules+"', config.output.dirs.mediawiki) + '","\n");',
        ],
        // Avoid loading modules from other ZIM through local storage
        // https://github.com/kiwix/overview/issues/127
        [/,(key:"MediaWikiModuleStore:[^"]+?",vary:"[^"]+?)",/, `,$1:${Date.now()}",`],
        // Never load the source map in dev tools
        [/\/\/# sourceMappingURL=/, '// sourceMappingURL='],
      ]),
    )
  }

  const moduleLang = MediaWiki.metaData?.langVar || MediaWiki.metaData?.langMw || 'en'
  let apiParameterOnly = ''
  let moduleApiUrl: string
  if (module === 'startup') {
    apiParameterOnly = '&only=scripts&raw=1'
  } else if (type === 'css') {
    apiParameterOnly = '&only=styles'
  }

  if (!module.includes('javascript/mobile') && !module.includes('css/mobile')) {
    moduleApiUrl = encodeURI(`${MediaWiki.modulePath}lang=${moduleLang}&modules=${module}${apiParameterOnly}&skin=${MediaWiki.skin}`)
  } else {
    moduleApiUrl = encodeURI(`https:${module}`)
  }

  logger.info(`Getting [${type}] module [${moduleApiUrl}]`)

  const { content } = await Downloader.downloadContent(moduleApiUrl, 'module')
  let text = content.toString()

  if (type === 'js') {
    switch (module) {
      case 'startup':
        text = hackStartUpModule(text)
        break
      case 'mediawiki.base':
        text = replaceCodeByRegex(
          text,
          new Map([
            [/"wgArticlePath":"[^"]*"/, '"wgArticlePath":RLCONF.zimRelativeFilePath+"$1"'],
            [/"wgScriptPath":"([^"]*)"/, '"wgScriptPath":"' + MediaWiki.baseUrl.origin + '$1"'],
            [/"wgScript":"([^"]*)"/, '"wgScript":"' + MediaWiki.baseUrl.origin + '$1"'],
            [/"wgExtensionAssetsPath":"([^"]*)"/, '"wgExtensionAssetsPath":"' + MediaWiki.baseUrl.origin + '$1"'],
            [/"stylepath":"([^"]*)"/, '"stylepath":"' + MediaWiki.baseUrl.origin + '$1"'],
          ]),
        )
        break
      case 'mediawiki.page.ready':
        text = replaceCodeByRegex(text, new Map([[RULE_TO_REDIRECT, 'false']]))
        break
    }
    const embeddedCss = text.match(/,{"css":(\[".*?"\])}/)
    if (embeddedCss) {
      try {
        const cssParts: string[] = JSON.parse(embeddedCss[1])
        const processedCss = JSON.stringify(
          cssParts.map((cssPart) => {
            return processStylesheetContent(moduleApiUrl, '', cssPart, '', true)
          }),
        ).replace(/__RELATIVE_FILE_PATH__/g, '"+RLCONF.zimRelativeFilePath+"')
        text = text.replace(embeddedCss[0], `,{"css":${processedCss}}`)
      } catch (e) {
        logger.warn(`Unable to rewrite embedded CSS in JS module [${module}]`, e)
      }
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
    const modulePath = type === 'js' ? jsPath(module + '.js', config.output.dirs.mediawiki) : cssPath(module + '.css', config.output.dirs.mediawiki)
    const mimetype = type === 'js' ? 'text/javascript' : 'text/css'
    await zimCreatorMutex.runExclusive(() => zimCreator.addItem(new StringItem(modulePath, mimetype, null, { FRONT_ARTICLE: 0 }, text)))
    logger.info(`Saved module [${module}] at ${modulePath}`)
  } catch (e) {
    logger.error(`Failed to get module with url [${moduleApiUrl}]\nYou may need to specify a custom --mwModulePath`, e)
    throw e
  }
}

export async function downloadAndSaveStartupModule(zimCreator: Creator): Promise<ResourceLoaderModule[]> {
  const module = 'startup'
  const { text, moduleApiUrl } = await downloadModule(module, 'js')

  try {
    const modulePath = jsPath(module, config.output.dirs.mediawiki)
    const mimetype = 'text/javascript'
    await zimCreatorMutex.runExclusive(() => zimCreator.addItem(new StringItem(modulePath, mimetype, null, { FRONT_ARTICLE: 0 }, text)))
    logger.info(`Saved module [${module}] at ${modulePath}`)
    return JSON.parse(text.match(/;mw\.loader\.register\((\[\[.*?\]\])\);\s?mw\./)[1])
  } catch (e) {
    logger.error(`Failed to get module with url [${moduleApiUrl}]\nYou may need to specify a custom --mwModulePath`, e)
    throw e
  }
}

export function getModuleDependencies(oneModule: ResourceLoaderModule, allModules: ResourceLoaderModule[]): string[] {
  const allDeps = []
  const deps = oneModule[2] || []
  if (deps.length) {
    deps.forEach((oneDep) => {
      allDeps.push(allModules[oneDep][0], ...getModuleDependencies(allModules[oneDep], allModules))
    })
  }
  return allDeps
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

export interface ResourceLoaderModule extends Array<any> {
  0: string
  1: string
  2?: number[]
  3?: number
  4?: string
}
