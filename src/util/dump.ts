import { fileURLToPath } from 'url'
import * as logger from '../Logger.js'
import Downloader from '../Downloader.js'
import FileManager from './FileManager.js'
import { getFullUrl, jsPath, cssPath, getRelativeFilePath, getMediaBase } from './index.js'
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

export async function processStylesheetContent(cssUrl: string, linkMedia: string, body: string, articleId?: string, isJs?: boolean) {
  // articleId is supposed to be passed only when we rewrite inline CSS for a given article and we hence have
  // to compute relative path to assets

  const importRegexp = /@import\s+(?:url\(\s*(['"]?)(.*?)\1\s*\)|(['"])(.*?)\3)\s*([^;]*);/gi
  const cssUrlRegexp = new RegExp('url\\([\'"]{0,1}(.*?)[\'"]{0,1}\\)', 'gi')

  type CssPart = { type: 'css'; text: string }
  type ImportPart = { type: 'import'; url: string; conditions: string }
  type StylesheetParts = Array<CssPart | ImportPart>

  const wrapStylesheetContent = (css: string, url: string, conditions: string) => {
    let wrappedCss = css
    const rawConditions = conditions.trim()

    if (rawConditions) {
      const supportsMatch = rawConditions.match(/supports\s*\((.*?)\)/i)
      const supportsCondition = supportsMatch?.[1]?.trim()
      const mediaCondition = rawConditions.replace(/supports\s*\((.*?)\)/i, '').trim()

      if (supportsCondition) {
        wrappedCss = `@supports (${supportsCondition}) {\n${wrappedCss}\n}\n`
      }
      if (mediaCondition) {
        wrappedCss = `@media ${mediaCondition} {\n${wrappedCss}\n}\n`
      }
    }

    return `\n/* start ${url} */\n\n${wrappedCss}\n/* end   ${url} */\n`
  }

  const rewriteCssDependencies = async (sourceCss: string, sourceUrl: string) => {
    let rewrittenCss = sourceCss
    let match: any

    while ((match = cssUrlRegexp.exec(sourceCss))) {
      const url = match[1]

      /* Avoid 'data', so no URL dependency */
      if (url && !url.match('^data')) {
        const fullurl = getFullUrl(url, sourceUrl)
        const filepath = getMediaBase(fullurl, true)

        /* Rewrite the CSS */
        const relativePath = articleId ? getRelativeFilePath(articleId, filepath) : isJs ? `__RELATIVE_FILE_PATH__${filepath}` : `../${filepath}`
        rewrittenCss = rewrittenCss.replace(url, relativePath.replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29'))

        await FileManager.addFileToProcess(filepath, { url: urlHelper.serializeUrl(fullurl), kind: 'media' })
      }
    }

    cssUrlRegexp.lastIndex = 0
    return rewrittenCss
  }

  // Iterative worklist to resolve @import statements (no depth limit).
  // Each entry carries its own URL so that url() references are resolved relative to each stylesheet.
  const processedImportUrls = new Set<string>()
  const worklist: Array<{ url: string; body: string }> = [{ url: cssUrl, body }]
  const stylesheetParts = new Map<string, StylesheetParts>()

  while (worklist.length > 0) {
    const current = worklist.shift()!
    const currentBody = current.body

    const parts: StylesheetParts = []
    let startIdx = 0

    /* Find and queue @import URLs */
    let importMatch: RegExpExecArray | null
    const importRe = new RegExp(importRegexp.source, importRegexp.flags)
    while ((importMatch = importRe.exec(currentBody)) !== null) {
      if (importMatch.index > startIdx) {
        parts.push({ type: 'css', text: currentBody.substring(startIdx, importMatch.index) })
      }

      const importUrl = importMatch[2] || importMatch[4]
      const importConditions = (importMatch[5] || '').trim()

      if (importUrl) {
        const fullUrl = getFullUrl(importUrl, current.url)
        parts.push({ type: 'import', url: fullUrl, conditions: importConditions })

        if (!processedImportUrls.has(fullUrl)) {
          processedImportUrls.add(fullUrl)
          try {
            const { content } = await Downloader.downloadContent(fullUrl, 'css')
            worklist.push({ url: fullUrl, body: content.toString() })
          } catch {
            logger.warn(`Failed to download imported CSS: ${fullUrl}`)
          }
        }
      }

      startIdx = importRe.lastIndex
    }

    if (startIdx < currentBody.length) {
      parts.push({ type: 'css', text: currentBody.substring(startIdx) })
    }

    stylesheetParts.set(current.url, parts)
  }

  const renderedImportedUrls = new Set<string>()
  const renderStack = new Set<string>()

  const renderStylesheet = async (url: string, conditions = ''): Promise<string> => {
    if (renderedImportedUrls.has(url)) {
      return ''
    }
    if (renderStack.has(url)) {
      return ''
    }

    const parts = stylesheetParts.get(url)
    if (!parts) {
      return ''
    }

    renderedImportedUrls.add(url)
    renderStack.add(url)
    let currentBody = ''
    for (const part of parts) {
      if (part.type === 'css') {
        currentBody += await rewriteCssDependencies(part.text, url)
      } else {
        currentBody += await renderStylesheet(part.url, part.conditions)
      }
    }
    renderStack.delete(url)

    return wrapStylesheetContent(currentBody, url, conditions)
  }

  return await renderStylesheet(cssUrl, linkMedia)
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
        [/,"wgResourceLoaderMaxQueryLength":\d+,/, ',"wgResourceLoaderMaxQueryLength":0,'],
        // Load modules from the ZIM
        [
          /addScript\(sourceLoadScript\+'\?'\+makeQueryString\(query\)(,null,packed\.list)?\);/,
          'addScript(RLCONF.zimRelativeFilePath+"' + jsPath('"+query.modules+"', config.output.dirs.mediawiki) + '"$1);',
        ],
        [
          /addScript\(sourceLoadScript\+'\?'\+\$\.param\(request\)\);/,
          'addScript(RLCONF.zimRelativeFilePath+"' + jsPath('"+request.modules+"', config.output.dirs.mediawiki) + '");',
        ],
        // Load modules from local storage with source like from the ZIM
        [
          /srcParts\.push\('\/\/# sourceURL=',\(new URL\(sourceLoadScript,location\)\)\.href,'\?',makeQueryString\(query\),'\n'\);/,
          'srcParts.push("//# sourceURL=",RLCONF.zimRelativeFilePath,"' + jsPath('"+query.modules+"', config.output.dirs.mediawiki) + '","\n");',
        ],
        // Avoid loading modules from other ZIM through local storage
        // https://github.com/kiwix/overview/issues/127
        [/,(key:"MediaWikiModuleStore:[^"]+?",vary:"[^"]+?)",/, `,$1:${Date.now()}",`],
        [/,"wgResourceLoaderStorageVersion":"/, `,"wgResourceLoaderStorageVersion":"${Date.now()}:`],
        // Never load the source map in dev tools
        [/\/\/# sourceMappingURL=/, '// sourceMappingURL='],
      ]),
    )
  }

  const moduleLang = MediaWiki.metaData?.langVar || MediaWiki.metaData?.langMw || 'en'
  let apiParameterOnly = ''
  if (module === 'startup') {
    apiParameterOnly = '&only=scripts&raw=1'
  } else if (type === 'css') {
    apiParameterOnly = '&only=styles'
  }

  const moduleApiUrl = encodeURI(`${MediaWiki.modulePath}lang=${moduleLang}&modules=${module}${apiParameterOnly}&skin=${MediaWiki.skin}`)

  logger.info(`Getting [${type}] module [${moduleApiUrl}]`)

  const { content } = await Downloader.downloadContent(moduleApiUrl, 'module')
  let text = content.toString()

  if (type === 'js') {
    switch (module) {
      case 'startup':
      case 'mediawiki':
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
      case 'mediawiki.page.startup':
      case 'mediawiki.page.ready':
        text = replaceCodeByRegex(text, new Map([[RULE_TO_REDIRECT, 'false']]))
        break
    }
    const embeddedCss = text.match(/,{"css":(\[".*?"\])}/)
    if (embeddedCss) {
      try {
        const cssParts: string[] = JSON.parse(embeddedCss[1])
        const processedCss = JSON.stringify(
          await Promise.all(
            cssParts.map((cssPart) => {
              return processStylesheetContent(moduleApiUrl, '', cssPart, '', true)
            }),
          ),
        ).replace(/__RELATIVE_FILE_PATH__/g, '"+RLCONF.zimRelativeFilePath+"')
        text = text.replace(embeddedCss[0], `,{"css":${processedCss}}`)
      } catch (e) {
        logger.warn(`Unable to rewrite embedded CSS in JS module [${module}]`, e)
      }
    }
  }

  if (type === 'css') {
    text = await processStylesheetContent(moduleApiUrl, '', text, '')
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
    return JSON.parse(text.match(/;mw\.loader\.register\((\[\[.*?\]\])\);+\s?mw\./s)[1])
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

// Download a custom CSS file and save it into the ZIM.
export async function downloadAndSaveCustomCss(zimCreator: Creator, cssUrl: string, filename: string): Promise<void> {
  logger.log(`Downloading custom CSS [${cssUrl}]`)
  const { content: cssBody } = await Downloader.downloadContent(cssUrl, 'css')
  const processedCss = await processStylesheetContent(cssUrl, '', cssBody.toString())
  const zimPath = cssPath(filename, config.output.dirs.res)
  await zimCreatorMutex.runExclusive(() => zimCreator.addItem(new StringItem(zimPath, 'text/css', null, { FRONT_ARTICLE: 0 }, processedCss)))
  logger.log(`Saved custom CSS [${cssUrl}] at ${zimPath}`)
}

// URLs should be kept the same as Kiwix JS relies on it.
export async function addWebpJsScripts(zimCreator: Creator) {
  await Promise.all(
    [
      { name: 'webpHeroPolyfill', path: path.join(__dirname, '../../node_modules/webp-hero/dist-cjs/polyfills.js') },
      { name: 'webpHeroBundle', path: path.join(__dirname, '../../node_modules/webp-hero/dist-cjs/webp-hero.bundle.js') },
      { name: 'webpHandler', path: path.join(__dirname, '../../res/webpHandler.js') },
    ].map(async ({ name, path: scriptPath }) => {
      const item = new StringItem(`${config.output.dirs.webp}/${jsPath(name)}`, 'text/javascript', null, { FRONT_ARTICLE: 0 }, fs.readFileSync(scriptPath, 'utf8').toString())
      await zimCreatorMutex.runExclusive(() => zimCreator.addItem(item))
    }),
  )
}

export interface ResourceLoaderModule extends Array<any> {
  0: string
  1: string
  2?: number[]
  3?: number
  4?: string
}
