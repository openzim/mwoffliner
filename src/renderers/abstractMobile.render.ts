import * as domino from 'domino'
import { Renderer } from './abstract.renderer.js'
import { getStaticFiles, genCanonicalLink, genHeaderScript, genHeaderCSSLink, getRelativeFilePath } from '../util/misc.js'
import { config } from '../config.js'
import MediaWiki from '../MediaWiki.js'
import Downloader from '../Downloader.js'

import { htmlWikimediaMobileTemplateCode } from '../Templates.js'

export abstract class MobileRenderer extends Renderer {
  public staticFilesListMobile: string[] = []
  constructor() {
    super()
    this.staticFilesListMobile = this.staticFilesListCommon.concat(getStaticFiles(config.output.wikimediaMobileJsResources, config.output.wikimediaMobileCssResources))
  }

  public filterWikimediaMobileModules(_moduleDependencies) {
    const { jsDependenciesList, styleDependenciesList } = _moduleDependencies as {
      jsDependenciesList: string[]
      styleDependenciesList: string[]
    }

    const wikimediaMobileJsModuleDependencies = jsDependenciesList.filter((item) => item.includes('javascript/mobile'))
    const wikimediaMobileCssModuleDependencies = styleDependenciesList.filter((item) => item.includes('css/mobile'))

    const wikimediaMobileModuleDependencies = {
      jsDependenciesList: wikimediaMobileJsModuleDependencies,
      styleDependenciesList: wikimediaMobileCssModuleDependencies,
    }

    return wikimediaMobileModuleDependencies
  }

  private genWikimediaMobileOverrideCSSLink(relativeFilePath: string, css: string) {
    return `<link rel="stylesheet" href="${relativeFilePath}${config.output.dirs.res}/${css}.css" />`
  }

  private genWikimediaMobileOverrideScript(relativeFilePath: string, js: string) {
    return `<script src='${relativeFilePath}${config.output.dirs.res}/${js}.js'></script>`
  }

  public templateMobileArticle(moduleDependencies: any, articleId: string): Document {
    const { jsDependenciesList, styleDependenciesList } = moduleDependencies

    let articleJsList =
      jsDependenciesList.length === 0 ? '' : jsDependenciesList.map((oneJsDep: string) => genHeaderScript(config, oneJsDep, articleId, config.output.dirs.mediawiki)).join('\n')
    if (Downloader.webp) {
      articleJsList += genHeaderScript(config, 'webpHandler', articleId, config.output.dirs.webp)
    }
    const articleCssList =
      styleDependenciesList.length === 0
        ? ''
        : styleDependenciesList.map((oneCssDep: string) => genHeaderCSSLink(config, oneCssDep, articleId, config.output.dirs.mediawiki)).join('\n')

    const relativeFilePath = getRelativeFilePath(articleId, '')
    const htmlTemplateString = htmlWikimediaMobileTemplateCode()
      .replace('__ARTICLE_CANONICAL_LINK__', genCanonicalLink(config, MediaWiki.webUrl.href, articleId))
      .replace('__ARTICLE_CONFIGVARS_LIST__', '')
      .replace('__JS_SCRIPTS__', this.genWikimediaMobileOverrideScript(relativeFilePath, config.output.wikimediaMobileJsResources[0]))
      .replace('__CSS_LINKS__', this.genWikimediaMobileOverrideCSSLink(relativeFilePath, config.output.wikimediaMobileCssResources[0]))
      .replace('__ARTICLE_JS_LIST__', articleJsList)
      .replace('__ARTICLE_CSS_LIST__', articleCssList)
      .replace(/__ASSETS_DIR__/g, config.output.dirs.assets)
      .replace(/__RES_DIR__/g, config.output.dirs.res)
      .replace(/__MW_DIR__/g, config.output.dirs.mediawiki)
      .replace(/__RELATIVE_FILE_PATH__/g, getRelativeFilePath(articleId, ''))

    return domino.createDocument(htmlTemplateString)
  }
}
