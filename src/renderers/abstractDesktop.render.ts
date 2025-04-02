import * as domino from 'domino'
import { DownloadOpts, DownloadRes, Renderer } from './abstract.renderer.js'
import { getStaticFiles, genCanonicalLink, genHeaderScript, genHeaderCSSLink } from '../util/misc.js'
import { config } from '../config.js'
import MediaWiki from '../MediaWiki.js'

import { htmlWikimediaDesktopTemplateCode } from '../Templates.js'

export abstract class DesktopRenderer extends Renderer {
  public staticFilesListDesktop: string[] = []
  constructor() {
    super()
    this.staticFilesListDesktop = this.staticFilesListCommon.concat(getStaticFiles(config.output.jsResources, config.output.cssResources))
  }

  public async download(downloadOpts: DownloadOpts): Promise<DownloadRes> {
    const { downloader, articleUrl, articleDetail } = downloadOpts

    const moduleDependencies = this.filterWikimediaDesktopModules(await downloader.getModuleDependencies(articleDetail.title))

    const data = await downloader.getJSON<any>(articleUrl)
    /* istanbul ignore if */
    if (data.error) {
      throw data.error
    }

    return { data, moduleDependencies }
  }

  public filterWikimediaDesktopModules(_moduleDependencies) {
    const { jsConfigVars, jsDependenciesList, styleDependenciesList } = _moduleDependencies as {
      jsConfigVars: string
      jsDependenciesList: string[]
      styleDependenciesList: string[]
    }

    const wikimediaDesktopJsModuleDependencies = jsDependenciesList.filter((item) => !item.includes('javascript/mobile'))
    const wikimediaDesktopCssModuleDependencies = styleDependenciesList.filter((item) => !item.includes('css/mobile'))

    const wikimediaDesktopModuleDependencies = {
      jsConfigVars,
      jsDependenciesList: wikimediaDesktopJsModuleDependencies,
      styleDependenciesList: wikimediaDesktopCssModuleDependencies,
    }

    return wikimediaDesktopModuleDependencies
  }

  public templateDesktopArticle(moduleDependencies: any, articleId: string): Document {
    const { jsConfigVars, jsDependenciesList, styleDependenciesList } = moduleDependencies as {
      jsConfigVars
      jsDependenciesList: string[]
      styleDependenciesList: string[]
    }

    const cssLinks = config.output.cssResources.reduce((buf, css) => {
      return buf + genHeaderCSSLink(config, css, articleId)
    }, '')

    const jsScripts = config.output.jsResources.reduce((buf, js) => {
      return (
        buf +
        (js === 'script'
          ? genHeaderScript(config, js, articleId, '', `data-article-id="${articleId.replace(/"/g, '\\\\"')}" id="script-js"`)
          : genHeaderScript(config, js, articleId))
      )
    }, '')

    const htmlTemplateString = htmlWikimediaDesktopTemplateCode()
      .replace('__CSS_LINKS__', cssLinks)
      .replace('__JS_SCRIPTS__', jsScripts)
      .replace('__ARTICLE_CANONICAL_LINK__', genCanonicalLink(config, MediaWiki.webUrl.href, articleId))
      .replace('__ARTICLE_CONFIGVARS_LIST__', jsConfigVars !== '' ? genHeaderScript(config, 'jsConfigVars', articleId, config.output.dirs.mediawiki) : '')
      .replace(
        '__ARTICLE_JS_LIST__',
        jsDependenciesList.length !== 0 ? jsDependenciesList.map((oneJsDep) => genHeaderScript(config, oneJsDep, articleId, config.output.dirs.mediawiki)).join('\n') : '',
      )
      .replace(
        '__ARTICLE_CSS_LIST__',
        styleDependenciesList.length !== 0 ? styleDependenciesList.map((oneCssDep) => genHeaderCSSLink(config, oneCssDep, articleId, config.output.dirs.mediawiki)).join('\n') : '',
      )

    const htmlTemplateDoc = domino.createDocument(htmlTemplateString)
    return htmlTemplateDoc
  }
}
