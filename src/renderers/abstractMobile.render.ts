import * as domino from 'domino'
import { Renderer } from './abstract.renderer.js'
import { getStaticFiles, genCanonicalLink, genHeaderScript, genHeaderCSSLink } from '../util/misc.js'
import { config } from '../config.js'
import MediaWiki from '../MediaWiki.js'

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

  private genWikimediaMobileOverrideCSSLink(css: string) {
    return `<link rel="stylesheet" href="./${css}.css" />`
  }

  private genWikimediaMobileOverrideScript(js: string) {
    return `<script src='./${js}.js'></script>`
  }

  public templateMobileArticle(moduleDependencies: any, articleId: string): Document {
    const { jsDependenciesList, styleDependenciesList } = moduleDependencies

    const htmlTemplateString = htmlWikimediaMobileTemplateCode()
      .replace('__ARTICLE_CANONICAL_LINK__', genCanonicalLink(config, MediaWiki.webUrl.href, articleId))
      .replace('__ARTICLE_CONFIGVARS_LIST__', '')
      .replace('__JS_SCRIPTS__', this.genWikimediaMobileOverrideScript(config.output.wikimediaMobileJsResources[0]))
      .replace('__CSS_LINKS__', this.genWikimediaMobileOverrideCSSLink(config.output.wikimediaMobileCssResources[0]))
      .replace(
        '__ARTICLE_JS_LIST__',
        jsDependenciesList.length !== 0 ? jsDependenciesList.map((oneJsDep: string) => genHeaderScript(config, oneJsDep, articleId, config.output.dirs.mediawiki)).join('\n') : '',
      )
      .replace(
        '__ARTICLE_CSS_LIST__',
        styleDependenciesList.length !== 0
          ? styleDependenciesList.map((oneCssDep: string) => genHeaderCSSLink(config, oneCssDep, articleId, config.output.dirs.mediawiki)).join('\n')
          : '',
      )

    const htmlTemplateDoc = domino.createDocument(htmlTemplateString)
    return htmlTemplateDoc
  }
}
