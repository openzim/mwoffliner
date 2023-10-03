import * as domino from 'domino'
import { Renderer } from './abstract.renderer.js'
import { config } from '../config.js'
import MediaWiki from '../MediaWiki.js'

import { htmlTemplateCode } from '../Templates.js'
import { genCanonicalLink, genHeaderScript, genHeaderCSSLink } from '../util/misc.js'

export abstract class MobileRenderer extends Renderer {
  constructor() {
    super()
  }

  private genPCSCOverrideCSSLink(css: string) {
    return `<link rel="stylesheet" href="../-/${css}.css" />`
  }

  private genPCSOverrideScript(js: string) {
    return `<script src='../-/${js}.js'></script>`
  }

  public templateMobileArticle(moduleDependencies: any, articleId: string): Document {
    const { jsDependenciesList, styleDependenciesList } = moduleDependencies as {
      jsDependenciesList: string[]
      styleDependenciesList: string[]
    }

    const mobileJsModuleDependencies = jsDependenciesList.filter((item) => item.includes('javascript/mobile'))
    const mobileCssModuleDependencies = styleDependenciesList.filter((item) => item.includes('css/mobile'))

    const htmlTemplateString = htmlTemplateCode(articleId)
      .replace('__ARTICLE_CANONICAL_LINK__', genCanonicalLink(config, MediaWiki.webUrl.href, articleId))
      .replace('__ARTICLE_CONFIGVARS_LIST__', '')
      .replace('__ARTICLE_JS_LIST__', '')
      .replace('__ARTICLE_CSS_LIST__', '')
      .replace(
        '__JS_SCRIPTS_MOBILE__',
        mobileJsModuleDependencies.length !== 0
          ? mobileJsModuleDependencies.map((oneMobJsDep) => genHeaderScript(config, oneMobJsDep, articleId, config.output.dirs.mediawiki)).join('\n')
          : '',
      )
      .replace(
        '__CSS_LINKS_MOBILE__',
        mobileCssModuleDependencies.length !== 0
          ? mobileCssModuleDependencies.map((oneMobCssDep) => genHeaderCSSLink(config, oneMobCssDep, articleId, config.output.dirs.mediawiki)).join('\n')
          : '',
      )
      .replace('__PCS_CSS_OVERRIDE__', this.genPCSCOverrideCSSLink(config.output.pcsCssResources[0]))
      .replace('__PCS_JS_OVERRIDE__', this.genPCSOverrideScript(config.output.pcsJsResources[0]))

    const htmlTemplateDoc = domino.createDocument(htmlTemplateString)
    return htmlTemplateDoc
  }
}
