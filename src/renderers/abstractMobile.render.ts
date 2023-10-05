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

  private genWikimediaMobileOverrideCSSLink(css: string) {
    return `<link rel="stylesheet" href="../-/${css}.css" />`
  }

  private genWikimediaMobileOverrideScript(js: string) {
    return `<script src='../-/${js}.js'></script>`
  }

  public templateMobileArticle(moduleDependencies: any, articleId: string): Document {
    const { jsDependenciesList, styleDependenciesList } = moduleDependencies

    const htmlTemplateString = htmlTemplateCode(articleId)
      .replace('__ARTICLE_CANONICAL_LINK__', genCanonicalLink(config, MediaWiki.webUrl.href, articleId))
      .replace('__ARTICLE_CONFIGVARS_LIST__', '')
      .replace('__ARTICLE_JS_LIST__', '')
      .replace('__ARTICLE_CSS_LIST__', '')
      .replace(
        '__JS_SCRIPTS_MOBILE__',
        jsDependenciesList.length !== 0
          ? jsDependenciesList.map((oneMobJsDep: string) => genHeaderScript(config, oneMobJsDep, articleId, config.output.dirs.mediawiki)).join('\n')
          : '',
      )
      .replace(
        '__CSS_LINKS_MOBILE__',
        styleDependenciesList.length !== 0
          ? styleDependenciesList.map((oneMobCssDep: string) => genHeaderCSSLink(config, oneMobCssDep, articleId, config.output.dirs.mediawiki)).join('\n')
          : '',
      )
      .replace('__WM_MOBILE_CSS_OVERRIDE__', this.genWikimediaMobileOverrideCSSLink(config.output.wmMobileCssResources[0]))
      .replace('__WM_MOBILE_JS_OVERRIDE__', this.genWikimediaMobileOverrideScript(config.output.mwMobileJsResources[0]))

    const htmlTemplateDoc = domino.createDocument(htmlTemplateString)
    return htmlTemplateDoc
  }
}
