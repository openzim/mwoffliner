import * as domino from 'domino'
import { DownloadOpts, DownloadRes, Renderer } from './abstract.renderer.js'
import { getStaticFiles, genCanonicalLink, genHeaderScript, genHeaderCSSLink, getRelativeFilePath } from '../util/misc.js'
import { config } from '../config.js'
import MediaWiki from '../MediaWiki.js'

import { htmlWikimediaDesktopTemplateCode } from '../Templates.js'
import Downloader from '../Downloader.js'

export abstract class DesktopRenderer extends Renderer {
  public staticFilesListDesktop: string[] = []
  constructor() {
    super()
    this.staticFilesListDesktop = this.staticFilesListCommon.concat(getStaticFiles(config.output.jsResources, config.output.cssResources))
  }

  public async download(downloadOpts: DownloadOpts): Promise<DownloadRes> {
    const { articleUrl, articleDetail } = downloadOpts

    const moduleDependencies = this.filterWikimediaDesktopModules(await Downloader.getModuleDependencies(articleDetail.title))

    const data = await Downloader.getJSON<any>(articleUrl)
    if (data.error) {
      throw new Error(data.error)
    }

    return { data, moduleDependencies, redirects: [] }
  }

  public filterWikimediaDesktopModules(_moduleDependencies) {
    const { jsConfigVars, jsDependenciesList, styleDependenciesList } = _moduleDependencies as {
      jsConfigVars: KVS<any>
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
      jsConfigVars: KVS<any>
      jsDependenciesList: string[]
      styleDependenciesList: string[]
    }

    const cssLinks = config.output.cssResources.reduce((buf, css) => {
      return buf + genHeaderCSSLink(config, css, articleId, config.output.dirs.res)
    }, '')

    let jsScripts = config.output.jsResources.reduce((buf, js) => {
      return (
        buf +
        (js === 'script'
          ? genHeaderScript(config, js, articleId, config.output.dirs.res, `data-article-id="${articleId.replace(/"/g, '\\\\"')}" id="script-js"`)
          : genHeaderScript(config, js, articleId, config.output.dirs.res))
      )
    }, '')

    if (Downloader.webp) {
      jsScripts += genHeaderScript(config, 'webpHandler', articleId, config.output.dirs.webp)
    }

    const articleConfigVarsList = Object.keys(jsConfigVars).length ? '' : genHeaderScript(config, 'jsConfigVars', articleId, config.output.dirs.mediawiki)
    const articleJsList =
      jsDependenciesList.length === 0 ? '' : jsDependenciesList.map((oneJsDep: string) => genHeaderScript(config, oneJsDep, articleId, config.output.dirs.mediawiki)).join('\n')
    const articleCssList =
      styleDependenciesList.length === 0
        ? ''
        : styleDependenciesList.map((oneCssDep: string) => genHeaderCSSLink(config, oneCssDep, articleId, config.output.dirs.mediawiki)).join('\n')

    const htmlTemplateString = htmlWikimediaDesktopTemplateCode()
      .replace('__CSS_LINKS__', cssLinks)
      .replace('__JS_SCRIPTS__', jsScripts)
      .replace('__ARTICLE_CANONICAL_LINK__', genCanonicalLink(config, MediaWiki.webUrl.href, articleId))
      .replace('__ARTICLE_CONFIGVARS_LIST__', articleConfigVarsList)
      .replace('__ARTICLE_JS_LIST__', articleJsList)
      .replace('__ARTICLE_CSS_LIST__', articleCssList)
      .replace(/__ASSETS_DIR__/g, config.output.dirs.assets)
      .replace(/__RES_DIR__/g, config.output.dirs.res)
      .replace(/__MW_DIR__/g, config.output.dirs.mediawiki)
      .replace(/__RELATIVE_FILE_PATH__/g, getRelativeFilePath(articleId, ''))

    return domino.createDocument(htmlTemplateString)
  }
}
