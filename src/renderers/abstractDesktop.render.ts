import * as domino from 'domino'
import { Renderer } from './abstract.renderer.js'
import { config } from '../config.js'
import MediaWiki from '../MediaWiki.js'

import { htmlTemplateCode } from '../Templates.js'
import { genCanonicalLink, genHeaderScript, genHeaderCSSLink } from '../util/misc.js'

export abstract class DesktopRenderer extends Renderer {
  constructor() {
    super()
  }

  public templateDesktopArticle(moduleDependencies: any, articleId: string): Document {
    const { jsConfigVars, jsDependenciesList, styleDependenciesList } = moduleDependencies as {
      jsConfigVars: string | RegExpExecArray
      jsDependenciesList: string[]
      styleDependenciesList: string[]
    }

    const desktopJsModuleDependencies = jsDependenciesList.filter((item) => !item.includes('javascript/mobile'))
    const desktopCssModuleDependencies = styleDependenciesList.filter((item) => !item.includes('css/mobile'))

    const htmlTemplateString = htmlTemplateCode(articleId)
      .replace('__ARTICLE_CANONICAL_LINK__', genCanonicalLink(config, MediaWiki.webUrl.href, articleId))
      .replace('__ARTICLE_CONFIGVARS_LIST__', jsConfigVars !== '' ? genHeaderScript(config, 'jsConfigVars', articleId, config.output.dirs.mediawiki) : '')
      .replace(
        '__ARTICLE_JS_LIST__',
        desktopJsModuleDependencies.length !== 0
          ? desktopJsModuleDependencies.map((oneJsDep) => genHeaderScript(config, oneJsDep, articleId, config.output.dirs.mediawiki)).join('\n')
          : '',
      )
      .replace(
        '__ARTICLE_CSS_LIST__',
        desktopCssModuleDependencies.length !== 0
          ? desktopCssModuleDependencies.map((oneCssDep) => genHeaderCSSLink(config, oneCssDep, articleId, config.output.dirs.mediawiki)).join('\n')
          : '',
      )
      .replace('__JS_SCRIPTS_MOBILE__', '')
      .replace('__CSS_LINKS_MOBILE__', '')
      .replace('__PCS_CSS_OVERRIDE__', '')
      .replace('__PCS_JS_OVERRIDE__', '')

    const htmlTemplateDoc = domino.createDocument(htmlTemplateString)
    return htmlTemplateDoc
  }
}
