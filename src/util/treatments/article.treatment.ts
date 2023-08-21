// TODO: remove file later

import * as domino from 'domino'
import htmlMinifier from 'html-minifier'
import * as QueryStringParser from 'querystring'
import { Dump } from '../../../src/Dump.js'
import MediaWiki from '../../../src/MediaWiki.js'
import { rewriteUrlsOfDoc } from '../rewriteUrls.js'
import { encodeArticleIdForZimHtmlUrl, genCanonicalLink, genHeaderCSSLink, genHeaderScript, getMediaBase, interpolateTranslationString } from '../misc.js'
import { footerTemplate, htmlTemplateCode } from '../../Templates.js'
import { config } from '../../config.js'
import DOMUtils from '../../DOMUtils.js'
import mediaTreatment from './media.treatment.js'

class ArticleTreatment {
  /**
   * TODO: add temporary workaround to bypass 'test/e2e/cmd.e2e.test.ts'
   * Once article treatments will be replaced to render() method,
   * there should not be a problem to access to MediaWiki singleton
   */
  private mw: typeof MediaWiki

  async processArticleHtml(html: string, redisStore: RS, mw: any, dump: Dump, articleId: string, articleDetail: ArticleDetail, _moduleDependencies: any, webp: boolean) {
    this.mw = mw
    let mediaDependencies: Array<{ url: string; path: string }> = []
    let subtitles: Array<{ url: string; path: string }> = []
    let doc = domino.createDocument(html)

    const ruRet = await rewriteUrlsOfDoc(doc, articleId, redisStore, dump)
    doc = ruRet.doc
    mediaDependencies = mediaDependencies.concat(
      ruRet.mediaDependencies
        .filter((a) => a)
        .map((url) => {
          const path = getMediaBase(url, false)
          return { url, path }
        }),
    )
    doc = applyOtherTreatments(doc, dump)

    const tmRet = await mediaTreatment.treatMedias(doc, dump, articleId, webp, redisStore)

    doc = tmRet.doc

    mediaDependencies = mediaDependencies.concat(
      tmRet.mediaDependencies
        .filter((a) => a)
        .map((url) => {
          const path = getMediaBase(url, false)
          return { url, path }
        }),
    )

    subtitles = subtitles.concat(
      tmRet.subtitles
        .filter((a) => a)
        .map((url) => {
          const { title, lang } = QueryStringParser.parse(url) as { title: string; lang: string }
          const path = `${title}-${lang}.vtt`
          return { url, path }
        }),
    )

    if (!dump.isMainPage(articleId) && dump.customProcessor?.preProcessArticle) {
      doc = await dump.customProcessor.preProcessArticle(articleId, doc)
    }

    let templatedDoc = await this.templateArticle(doc, _moduleDependencies, dump, articleId, articleDetail, redisStore.articleDetailXId)

    if (dump.customProcessor && dump.customProcessor.postProcessArticle) {
      templatedDoc = await dump.customProcessor.postProcessArticle(articleId, templatedDoc)
    }

    let outHtml = templatedDoc.documentElement.outerHTML

    if (dump.opts.minifyHtml) {
      outHtml = htmlMinifier.minify(outHtml, {
        removeComments: true,
        conservativeCollapse: true,
        collapseBooleanAttributes: true,
        removeRedundantAttributes: true,
        removeEmptyAttributes: true,
        minifyCSS: true,
      })
    }

    const finalHTML = '<!DOCTYPE html>\n' + outHtml

    return {
      finalHTML,
      mediaDependencies,
      subtitles,
    }
  }

  private async templateArticle(
    parsoidDoc: DominoElement,
    moduleDependencies: any,
    dump: Dump,
    articleId: string,
    articleDetail: ArticleDetail,
    articleDetailXId: RKVS<ArticleDetail>,
  ): Promise<Document> {
    const { jsConfigVars, jsDependenciesList, styleDependenciesList } = moduleDependencies as {
      jsConfigVars: string | RegExpExecArray
      jsDependenciesList: string[]
      styleDependenciesList: string[]
    }

    const htmlTemplateDoc = domino.createDocument(
      htmlTemplateCode(articleId)
        .replace('__ARTICLE_CANONICAL_LINK__', genCanonicalLink(config, this.mw.webUrl.href, articleId))
        .replace('__ARTICLE_CONFIGVARS_LIST__', jsConfigVars !== '' ? genHeaderScript(config, 'jsConfigVars', articleId, config.output.dirs.mediawiki) : '')
        .replace(
          '__ARTICLE_JS_LIST__',
          jsDependenciesList.length !== 0 ? jsDependenciesList.map((oneJsDep) => genHeaderScript(config, oneJsDep, articleId, config.output.dirs.mediawiki)).join('\n') : '',
        )
        .replace(
          '__ARTICLE_CSS_LIST__',
          styleDependenciesList.length !== 0
            ? styleDependenciesList.map((oneCssDep) => genHeaderCSSLink(config, oneCssDep, articleId, config.output.dirs.mediawiki)).join('\n')
            : '',
        ),
    )

    /* Create final document by merging template and parsoid documents */
    htmlTemplateDoc.getElementById('mw-content-text').style.setProperty('direction', dump.mwMetaData.textDir)
    htmlTemplateDoc.getElementById('mw-content-text').innerHTML = parsoidDoc.getElementsByTagName('body')[0].innerHTML

    /* Title */
    htmlTemplateDoc.getElementsByTagName('title')[0].innerHTML = htmlTemplateDoc.getElementById('title_0')
      ? htmlTemplateDoc.getElementById('title_0').textContent
      : articleId.replace(/_/g, ' ')
    DOMUtils.deleteNode(htmlTemplateDoc.getElementById('titleHeading'))

    /* Subpage */
    if (this.isSubpage(articleId) && !dump.isMainPage(articleId)) {
      const headingNode = htmlTemplateDoc.getElementById('mw-content-text')
      const subpagesNode = htmlTemplateDoc.createElement('span')
      const parents = articleId.split('/')
      parents.pop()
      let subpages = ''
      await Promise.all(
        parents.map(async (parent) => {
          const label = parent.replace(/_/g, ' ')
          const isParentMirrored = await articleDetailXId.exists(`${articleId.split(parent)[0]}${parent}`)
          subpages += `&lt; ${
            isParentMirrored ? `<a href="${'../'.repeat(parents.length)}${encodeArticleIdForZimHtmlUrl(`${articleId.split(parent)[0]}${parent}`)}" title="${label}">` : ''
          }${label}${isParentMirrored ? '</a> ' : ' '}`
        }),
      )
      subpagesNode.innerHTML = subpages
      subpagesNode.setAttribute('class', 'subpages')
      headingNode.parentNode.insertBefore(subpagesNode, headingNode)
    }

    /* Set footer */
    const div = htmlTemplateDoc.createElement('div')

    /* Revision date */
    const date = new Date(articleDetail.timestamp)
    const lastEditedOnString = date
      ? interpolateTranslationString(dump.strings.LAST_EDITED_ON, {
          date: date.toISOString().substring(0, 10),
        })
      : null

    const creatorLink =
      '<a class="external text" ' +
      `${lastEditedOnString ? `title="${lastEditedOnString}"` : ''} ` +
      `href="${this.mw.webUrl.href}?title=${encodeURIComponent(articleId)}&oldid=${articleDetail.revisionId}">` +
      `${dump.mwMetaData.creator}</a>`

    const licenseLink = `<a class="external text" href="https://creativecommons.org/licenses/by-sa/4.0/">${dump.strings.LICENSE_NAME}</a>`

    div.innerHTML = footerTemplate({
      disclaimer: interpolateTranslationString(dump.strings.DISCLAIMER, {
        creator: creatorLink,
        license: licenseLink,
      }),
      strings: dump.strings,
    })
    htmlTemplateDoc.getElementById('mw-content-text').appendChild(div)
    this.addNoIndexCommentToElement(div)

    /* Geo-coordinates */
    if (articleDetail.coordinates) {
      const geoCoordinates = articleDetail.coordinates
      const metaNode = htmlTemplateDoc.createElement('meta')
      metaNode.name = 'geo.position'
      metaNode.content = geoCoordinates
      htmlTemplateDoc.getElementsByTagName('head')[0].appendChild(metaNode)
    }

    return htmlTemplateDoc
  }

  private addNoIndexCommentToElement(element: DominoElement) {
    const slices = element.parentElement.innerHTML.split(element.outerHTML)
    element.parentElement.innerHTML = `${slices[0]}<!--htdig_noindex-->${element.outerHTML}<!--/htdig_noindex-->${slices[1]}`
  }

  private isSubpage(id: string) {
    if (id && id.indexOf('/') >= 0) {
      const namespace = id.indexOf(':') >= 0 ? id.substring(0, id.indexOf(':')) : ''
      const ns = this.mw.namespaces[namespace] // namespace already defined
      if (ns !== undefined) {
        return ns.allowedSubpages
      }
    }
    return false
  }
}

const articleTreatment = new ArticleTreatment()

export default articleTreatment
