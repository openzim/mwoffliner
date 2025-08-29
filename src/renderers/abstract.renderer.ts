import * as domino from 'domino'
import * as logger from '../Logger.js'
import * as QueryStringParser from 'querystring'
import htmlMinifier from 'html-minifier-terser'
import MediaWiki from '../MediaWiki.js'
import RedisStore from '../RedisStore.js'
import DOMUtils from '../DOMUtils.js'
import DU from '../DOMUtils.js'
import { config } from '../config.js'
import { Dump } from '../Dump.js'
import { rewriteUrlsOfDoc } from '../util/rewriteUrls.js'
import { footerTemplate } from '../Templates.js'
import { getFullUrl, getMediaBase, getRelativeFilePath, interpolateTranslationString, encodeArticleIdForZimHtmlUrl, getStaticFiles } from '../util/misc.js'
import { processStylesheetContent } from '../util/dump.js'
import { isMainPage, isSubpage } from '../util/articles.js'

type renderType = 'auto' | 'desktop' | 'mobile' | 'specific'
export type renderName = 'VisualEditor' | 'WikimediaDesktop' | 'WikimediaMobile' | 'RestApi' | 'ActionParse'

interface RendererBuilderOptionsBase {
  renderType: renderType
}

interface RendererBuilderOptionsCommon {
  renderType: renderType
  renderName?: never
}

interface RendererBuilderOptionsSpecific extends RendererBuilderOptionsBase {
  renderType: 'specific'
  renderName: renderName
}

export type RendererBuilderOptions = RendererBuilderOptionsCommon | RendererBuilderOptionsSpecific

export interface DownloadOpts {
  articleId: string
  articleUrl: string
  articleDetail: ArticleDetail
}

export interface Redirect {
  from: string
  to: string
}

export interface DownloadRes {
  data?: any
  moduleDependencies: any
  redirects: Redirect[]
  displayTitle?: string
  articleSubtitle?: string
  bodyCssClass?: string
  htmlCssClass?: string
}

export interface RenderOptsModules {
  jsConfigVars: string | any
  jsDependenciesList: string[]
  styleDependenciesList: string[]
}

export interface RenderOpts {
  data?: any
  moduleDependencies: RenderOptsModules
  articleId?: string
  articleDetailXId?: RKVS<ArticleDetail>
  articleDetail?: ArticleDetail
  displayTitle?: string
  articleSubtitle?: string
  bodyCssClass?: string
  htmlCssClass?: string
  dump: Dump
}

export interface ProcessHtmlOpts {
  html: string
  dump: Dump
  articleId: string
  articleDetail: any
  displayTitle?: string
  articleSubtitle?: string
  moduleDependencies: any
  callback: any
}

export interface RenderSingleOutput {
  articleId: string
  displayTitle: string
  html: string
  imageDependencies: any
  videoDependencies: any
  mediaDependencies: any
  moduleDependencies: any
  staticFiles: string[]
  subtitles: any
}

export type RenderOutput = RenderSingleOutput[]

export abstract class Renderer {
  public staticFilesListCommon: string[] = []
  constructor() {
    if (this.staticFilesListCommon.length === 0) {
      this.staticFilesListCommon = getStaticFiles(config.output.jsResourcesCommon, config.output.cssResourcesCommon)
    }
  }

  protected async treatVideo(
    dump: Dump,
    srcCache: KVS<boolean>,
    articleId: string,
    videoEl: DominoElement,
  ): Promise<{ imageDependencies: string[]; videoDependencies: string[]; subtitles: string[] }> {
    const imageDependencies: string[] = []
    const videoDependencies: string[] = []
    const subtitles: string[] = []

    if (dump.nopic || dump.novid || dump.nodet) {
      DOMUtils.deleteNode(videoEl)
      return { imageDependencies, videoDependencies, subtitles }
    }

    this.adjustVideoElementAttributes(videoEl)

    const chosenVideoSourceEl = this.chooseBestVideoSource(videoEl)

    if (!chosenVideoSourceEl) {
      logger.warn(`Unable to find an appropriate video/audio source for an media element in article '${articleId}'`)
      DOMUtils.deleteNode(videoEl)
      return { imageDependencies, videoDependencies, subtitles }
    }

    this.handleVideoPoster(videoEl, articleId, imageDependencies, srcCache)
    this.updateVideoSrc(chosenVideoSourceEl, articleId, srcCache, videoDependencies)

    const trackElements = Array.from(videoEl.querySelectorAll('track'))
    for (const track of trackElements) {
      subtitles.push(await this.treatSubtitle(track, articleId))
    }

    return { imageDependencies, videoDependencies, subtitles }
  }

  private adjustVideoElementAttributes(videoEl: DominoElement): void {
    if (videoEl.getAttribute('height') && videoEl.getAttribute('height') < 40) {
      videoEl.setAttribute('height', '40')
    }
    videoEl.setAttribute('controls', '40')
  }

  private chooseBestVideoSource(videoEl: DominoElement): DominoElement | null {
    /* Choose best fiting resolution <source> video node */
    const videoSourceEls: any[] = Array.from(videoEl.children).filter((child: any) => child.tagName === 'SOURCE')
    const videoDisplayedWidth = Number(videoEl.getAttribute('width'))
    let bestWidthDiff = 424242
    let chosenVideoSourceEl: DominoElement
    videoSourceEls.forEach((videoSourceEl: DominoElement) => {
      // Ignore non-webm && non-audio sources
      const videoSourceType = videoSourceEl.getAttribute('type')
      if (!videoSourceEl.getAttribute('src').endsWith('.webm') && !videoSourceType.startsWith('audio')) {
        DOMUtils.deleteNode(videoSourceEl)
        return
      }

      // Handle audio content
      if (videoSourceType.startsWith('audio/ogg')) {
        chosenVideoSourceEl = videoSourceEl
        return
      } else if (videoSourceType.startsWith('audio')) {
        DOMUtils.deleteNode(videoSourceEl)
        return
      }

      // If undefined displayed width, then take the best <source> resolution
      const videoSourceElWidth = Number(videoSourceEl.getAttribute('data-file-width') || videoSourceEl.getAttribute('data-width') || 0)
      if (!videoDisplayedWidth) {
        const chosenVideoSourceElWidth = chosenVideoSourceEl ? chosenVideoSourceEl.getAttribute('data-file-width') || chosenVideoSourceEl.getAttribute('data-width') || 0 : 0
        if (videoSourceElWidth > chosenVideoSourceElWidth || (videoSourceElWidth === chosenVideoSourceElWidth && videoSourceEl.getAttribute('src').endsWith('.vp9.webm'))) {
          DOMUtils.deleteNode(chosenVideoSourceEl)
          chosenVideoSourceEl = videoSourceEl
          return
        }
      }

      // Otherwise, choose <source> with better (smaller) width diff
      else {
        const widthDiff = Number(videoSourceElWidth - videoDisplayedWidth)

        // If no source has been picked so far, just take this one
        if (!chosenVideoSourceEl) {
          chosenVideoSourceEl = videoSourceEl
          bestWidthDiff = widthDiff
          return
        }

        // Resolution of source is higher than displayed resolution
        else if (widthDiff >= 0) {
          if (bestWidthDiff < 0 || widthDiff < bestWidthDiff || (widthDiff === bestWidthDiff && videoSourceEl.getAttribute('src').endsWith('.vp9.webm'))) {
            DOMUtils.deleteNode(chosenVideoSourceEl)
            chosenVideoSourceEl = videoSourceEl
            bestWidthDiff = widthDiff
            return
          }
        }

        // Resolution of source is smaller than displayed resolution
        else {
          if (widthDiff > bestWidthDiff || (widthDiff === bestWidthDiff && videoSourceEl.getAttribute('src').endsWith('.vp9.webm'))) {
            DOMUtils.deleteNode(chosenVideoSourceEl)
            chosenVideoSourceEl = videoSourceEl
            bestWidthDiff = widthDiff
            return
          }
        }
      }

      // Delete all other nodes
      DOMUtils.deleteNode(videoSourceEl)
    })

    return chosenVideoSourceEl
  }

  private handleVideoPoster(videoEl: DominoElement, articleId: string, imageDependencies: string[], srcCache: KVS<boolean>): void {
    const posterUrl = videoEl.getAttribute('poster')
    if (posterUrl) {
      const videoPosterUrl = getFullUrl(posterUrl, MediaWiki.baseUrl)
      const newVideoPosterUrl = getRelativeFilePath(articleId, getMediaBase(videoPosterUrl, true))

      if (posterUrl) {
        videoEl.setAttribute('poster', newVideoPosterUrl)
      }
      videoEl.removeAttribute('resource')

      // eslint-disable-next-line no-prototype-builtins
      if (!srcCache.hasOwnProperty(videoPosterUrl)) {
        srcCache[videoPosterUrl] = true
        imageDependencies.push(videoPosterUrl)
      }
    }
  }

  private updateVideoSrc(chosenVideoSourceEl: DominoElement, articleId: string, srcCache: KVS<boolean>, videoDependencies: string[]): void {
    /* Download content, but avoid duplicate calls */
    const sourceUrl = getFullUrl(chosenVideoSourceEl.getAttribute('src'), MediaWiki.baseUrl)
    // eslint-disable-next-line no-prototype-builtins
    if (!srcCache.hasOwnProperty(sourceUrl)) {
      srcCache[sourceUrl] = true
      videoDependencies.push(sourceUrl)
    }

    /* Set new URL for the video element */
    const fileBase = getMediaBase(sourceUrl, true)
    chosenVideoSourceEl.setAttribute('src', getRelativeFilePath(articleId, fileBase))
  }

  protected async treatSubtitle(trackEle: DominoElement, articleId: string): Promise<string> {
    const subtitleSourceUrl = getFullUrl(trackEle.getAttribute('src'), MediaWiki.baseUrl)
    const { title, lang } = QueryStringParser.parse(subtitleSourceUrl) as { title: string; lang: string }
    // The source URL we get from Mediawiki article is in srt format, so we replace it to vtt which is standard subtitle trackformat for <track> src attribute.
    const vttFormatUrl = new URL(subtitleSourceUrl)
    vttFormatUrl.searchParams.set('trackformat', 'vtt')
    trackEle.setAttribute('src', `${getRelativeFilePath(articleId, title)}-${lang}.vtt`)
    return vttFormatUrl.href
  }

  private treatImageFrames(dump: Dump, parsoidDoc: DominoElement, imageNode: DominoElement) {
    const image = imageNode.getElementsByTagName('img')[0] || imageNode.getElementsByTagName('video')[0]

    if (!this.shouldKeepNode(dump, imageNode, image)) {
      DOMUtils.deleteNode(imageNode)
      return
    }

    if (this.constructor.name === 'ActionParseRenderer') {
      return
    }

    const descriptions = imageNode.getElementsByTagName('figcaption')
    const description = descriptions.length > 0 ? descriptions[0] : undefined
    const imageWidth = parseInt(image.getAttribute('width'), 10)

    const thumbDiv = this.makeThumbDiv(dump, parsoidDoc, imageNode)

    const thumbinnerDiv = parsoidDoc.createElement('div')
    thumbinnerDiv.setAttribute('class', 'thumbinner')
    thumbinnerDiv.setAttribute('style', `width:${imageWidth + 2}px`)

    const thumbcaptionDiv = parsoidDoc.createElement('div')
    thumbcaptionDiv.setAttribute('class', 'thumbcaption')
    const autoAlign = dump.mwMetaData.textDir === 'ltr' ? 'left' : 'right'
    thumbcaptionDiv.setAttribute('style', `text-align: ${autoAlign}`)
    if (description) {
      thumbcaptionDiv.innerHTML = description.innerHTML
    }

    thumbinnerDiv.appendChild(this.isStillLinked(image) ? image.parentNode : image)
    thumbinnerDiv.appendChild(thumbcaptionDiv)
    thumbDiv.appendChild(thumbinnerDiv)

    imageNode.parentNode.replaceChild(thumbDiv, imageNode)
  }

  private async treatImage(dump: Dump, srcCache: KVS<boolean>, articleId: string, img: DominoElement): Promise<{ imageDependencies: string[] }> {
    const imageDependencies: string[] = []

    if (!this.shouldKeepImage(dump, img)) {
      DOMUtils.deleteNode(img)
      return { imageDependencies }
    }

    /* Rewrite image src attribute */
    const src = getFullUrl(img.getAttribute('src'), MediaWiki.baseUrl)
    let newSrc: string
    try {
      const slashesInUrl = articleId.split('/').length - 1
      const upStr = slashesInUrl ? '../'.repeat(slashesInUrl) : './'
      newSrc = upStr + getMediaBase(src, true)
      /* Download image, but avoid duplicate calls */
      // eslint-disable-next-line no-prototype-builtins
      if (!srcCache.hasOwnProperty(src)) {
        srcCache[src] = true
        imageDependencies.push(src)
      }

      /* Change image source attribute to point to the local image */
      img.setAttribute('src', newSrc)

      /* Remove useless 'resource' attribute */
      img.removeAttribute('resource')

      /* Remove srcset */
      img.removeAttribute('srcset')
    } catch {
      DOMUtils.deleteNode(img)
    }

    /* Add lazy loading */
    img.setAttribute('loading', 'lazy')

    return { imageDependencies }
  }

  private shouldKeepImage(dump: Dump, img: DominoElement) {
    const imageNodeClass = img.getAttribute('class') || ''
    const src = img.getAttribute('src')
    return (
      (!dump.nopic || imageNodeClass.includes('mwe-math-fallback-image-inline') || img.getAttribute('typeof') === 'mw:Extension/math') &&
      src &&
      !src.includes('./Special:FilePath/')
    )
  }

  protected async treatMedias(parsoidDoc: DominoElement, dump: Dump, articleId: string) {
    let imageDependencies: string[] = []
    let videoDependencies: string[] = []
    let subtitles: string[] = []
    /* Clean/rewrite image tags */
    const imgs = Array.from(parsoidDoc.getElementsByTagName('img'))
    const videos: DominoElement = Array.from(parsoidDoc.querySelectorAll('video, audio'))
    const srcCache: KVS<boolean> = {}

    for (const videoEl of videos) {
      // <video /> and <audio />
      const ret = await this.treatVideo(dump, srcCache, articleId, videoEl)
      imageDependencies = imageDependencies.concat(ret.imageDependencies)
      videoDependencies = videoDependencies.concat(ret.videoDependencies)
      subtitles = subtitles.concat(ret.subtitles)
    }

    for (const imgEl of imgs) {
      const ret = await this.treatImage(dump, srcCache, articleId, imgEl)
      imageDependencies = imageDependencies.concat(ret.imageDependencies)
    }

    /* Treat image figures + special spans */
    const figures = parsoidDoc.getElementsByTagName('figure')
    const spans = parsoidDoc.querySelectorAll('span[typeof~=mw:Image/Frameless],span[typeof~=mw:File/Frameless]')
    const imageNodes = Array.prototype.slice.call(figures).concat(Array.prototype.slice.call(spans))
    for (const imageNode of imageNodes) {
      this.treatImageFrames(dump, parsoidDoc, imageNode)
    }

    return { doc: parsoidDoc, imageDependencies, videoDependencies, subtitles }
  }

  private isStillLinked(image: DominoElement) {
    return image && image.parentNode && image.parentNode.tagName === 'A'
  }

  private shouldKeepNode(dump: Dump, imageNode: DominoElement, image: DominoElement) {
    return !dump.nopic && imageNode && image
  }

  private makeThumbDiv(dump: Dump, parsoidDoc: DominoElement, imageNode: DominoElement) {
    const imageNodeClass = imageNode.getAttribute('class') || ''
    let thumbDiv = parsoidDoc.createElement('div')
    thumbDiv.setAttribute('class', 'thumb')
    if (imageNodeClass.search('mw-halign-right') >= 0) {
      DOMUtils.appendToAttr(thumbDiv, 'class', 'tright')
    } else if (imageNodeClass.search('mw-halign-left') >= 0) {
      DOMUtils.appendToAttr(thumbDiv, 'class', 'tleft')
    } else if (imageNodeClass.search('mw-halign-center') >= 0) {
      DOMUtils.appendToAttr(thumbDiv, 'class', 'tnone')
      const centerDiv = parsoidDoc.createElement('center')
      centerDiv.appendChild(thumbDiv)
      thumbDiv = centerDiv
    } else {
      const revAutoAlign = dump.mwMetaData.textDir === 'ltr' ? 'right' : 'left'
      DOMUtils.appendToAttr(thumbDiv, 'class', `t${revAutoAlign}`)
    }
    return thumbDiv
  }

  // TODO: The first part of this method is common for all renders
  public async processHtml(processHtmlOpts: ProcessHtmlOpts) {
    const { html, dump, articleId, articleDetail, displayTitle, moduleDependencies, callback } = processHtmlOpts
    let { articleSubtitle } = processHtmlOpts
    let imageDependencies: Array<{ url: string; path: string }> = []
    let videoDependencies: Array<{ url: string; path: string }> = []
    let mediaDependencies: Array<{ url: string; path: string }> = []
    let subtitles: Array<{ url: string; path: string }> = []
    let doc = domino.createDocument(html)

    const ruRet = await rewriteUrlsOfDoc(doc, articleId, dump)
    doc = ruRet.doc
    mediaDependencies = mediaDependencies.concat(
      ruRet.mediaDependencies
        .filter((a) => a)
        .map((url) => {
          const path = getMediaBase(url, false)
          return { url, path }
        }),
    )
    doc = this.applyOtherTreatments(doc, dump, articleId)

    const tmRet = await this.treatMedias(doc, dump, articleId)

    doc = tmRet.doc

    // Subtitle
    if (articleSubtitle) {
      let articleSubtitleDoc = domino.createDocument(articleSubtitle)
      const ruRetSubtitle = await rewriteUrlsOfDoc(articleSubtitleDoc, articleId, dump)
      articleSubtitleDoc = ruRetSubtitle.doc
      articleSubtitle = articleSubtitleDoc.getElementsByTagName('body')[0].innerHTML
    }

    videoDependencies = videoDependencies.concat(
      tmRet.videoDependencies
        .filter((a) => a)
        .map((url) => {
          const path = getMediaBase(url, false)
          return { url, path }
        }),
    )

    imageDependencies = imageDependencies.concat(
      tmRet.imageDependencies
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

    if (!isMainPage(articleId) && dump.customProcessor?.preProcessArticle) {
      doc = await dump.customProcessor.preProcessArticle(articleId, doc)
    }

    let templatedDoc = callback(moduleDependencies, articleId)
    templatedDoc = await this.mergeTemplateDoc(templatedDoc, doc, dump, articleDetail, RedisStore.articleDetailXId, articleId, displayTitle, articleSubtitle)

    if (dump.customProcessor && dump.customProcessor.postProcessArticle) {
      templatedDoc = await dump.customProcessor.postProcessArticle(articleId, templatedDoc)
    }

    let outHtml = templatedDoc.documentElement.outerHTML

    if (dump.opts.minifyHtml) {
      outHtml = await htmlMinifier.minify(outHtml, {
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
      imageDependencies,
      videoDependencies,
      subtitles,
    }
  }

  private async mergeTemplateDoc(
    htmlTemplateDoc: DominoElement,
    parsoidDoc: DominoElement,
    dump: Dump,
    articleDetail: ArticleDetail,
    articleDetailXId: RKVS<ArticleDetail>,
    articleId: string,
    displayTitle: string,
    articleSubtitle: string,
  ) {
    /* Create final document by merging template and parsoid documents */
    const mwContentText = htmlTemplateDoc.getElementById('mw-content-text')
    mwContentText.lang = articleDetail.pagelang
    mwContentText.dir = articleDetail.pagedir
    mwContentText.classList.add('mw-content-' + articleDetail.pagedir)
    mwContentText.innerHTML = parsoidDoc.getElementsByTagName('body')[0].innerHTML

    /* Title */
    const articleTitle = htmlTemplateDoc.getElementById('title_0') ? htmlTemplateDoc.getElementById('title_0').textContent : articleId.replace(/_/g, ' ')
    htmlTemplateDoc.getElementsByTagName('title')[0].innerHTML = articleTitle
    // Set inline page title when missing
    const inlineTitle = htmlTemplateDoc.getElementById('firstHeading')
    if (inlineTitle && !inlineTitle.innerHTML) {
      inlineTitle.innerHTML = displayTitle || articleTitle
    }
    DOMUtils.deleteNode(htmlTemplateDoc.getElementById('titleHeading'))

    /* Subpage */
    if (this.constructor.name === 'ActionParseRenderer') {
      const mwContentSubtitle = htmlTemplateDoc.getElementById('mw-content-subtitle')
      mwContentSubtitle.innerHTML = articleSubtitle || ''
    } else if (isSubpage(articleId) && !isMainPage(articleId)) {
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
      `href="${MediaWiki.webUrl.href}?title=${encodeURIComponent(articleId)}&oldid=${articleDetail.revisionId}">` +
      `${dump.mwMetaData.title || dump.mwMetaData.creator}</a>`

    const licenseLink =
      (dump.mwMetaData.licenseUrl ? `<a class="external text" href="${dump.mwMetaData.licenseUrl}">` : '') +
      (dump.mwMetaData.licenseName || dump.mwMetaData.licenseUrl || dump.strings.LICENSE_UNKNOWN).replace(/</g, '&lt;') +
      (dump.mwMetaData.licenseUrl ? `</a>` : '')

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

  private clearLinkAndInputTags(parsoidDoc: DominoElement, filtersConfig: any, dump: Dump) {
    /* Don't need <link> and <input> tags */
    const nodesToDelete: Array<{ class?: string; tag?: string; filter?: (n: any) => boolean }> = [{ tag: 'link' }, { tag: 'input' }]

    /* Remove "map" tags if necessary */
    if (dump.nopic) {
      nodesToDelete.push({ tag: 'map' })
    }

    /* Remove gallery boxes if pics need stripping of if it doesn't have thumbs */
    nodesToDelete.push({
      class: 'gallerybox',
      filter(n) {
        return !n.getElementsByTagName('img').length && !n.getElementsByTagName('audio').length && !n.getElementsByTagName('video').length
      },
    })
    nodesToDelete.push({
      class: 'gallery',
      filter(n) {
        return !n.getElementsByClassName('gallerybox').length
      },
    })

    /* Remove element with black listed CSS classes */
    filtersConfig.cssClassBlackList.forEach((classname: string) => {
      nodesToDelete.push({ class: classname })
    })

    if (dump.nodet) {
      filtersConfig.nodetCssClassBlackList.forEach((classname: string) => {
        nodesToDelete.push({ class: classname })
      })
      nodesToDelete.push({
        tag: 'section',
        filter(n) {
          return n.getAttribute('data-mw-section-id') !== filtersConfig.leadSectionId
        },
      })
    }

    /* Remove element with black listed CSS classes and no link */
    filtersConfig.cssClassBlackListIfNoLink.forEach((classname: string) => {
      nodesToDelete.push({
        class: classname,
        filter(n) {
          return n.getElementsByTagName('a').length === 0
        },
      })
    })

    /* Delete them all */
    for (const t of nodesToDelete) {
      let nodes
      if (t.tag) {
        nodes = parsoidDoc.getElementsByTagName(t.tag)
      } else if (t.class) {
        nodes = parsoidDoc.getElementsByClassName(t.class)
      } else {
        return /* throw error? */
      }

      for (const node of Array.from(nodes)) {
        if (!t.filter || t.filter(node)) {
          DU.deleteNode(node)
        }
      }
    }
  }

  private clearNodes(parsoidDoc: DominoElement, filtersConfig: any) {
    const allNodes: DominoElement[] = Array.from(parsoidDoc.getElementsByTagName('*'))
    for (const node of allNodes) {
      /* ?? */
      node.removeAttribute('data-parsoid')
      node.removeAttribute('about')

      /* Lots of bloat about templates wikitext */
      node.removeAttribute('data-mw')

      if (node.getAttribute('img')) {
        /* Remove a few images Parsoid attributes */
        node.removeAttribute('data-file-width')
        node.removeAttribute('data-file-height')
        node.removeAttribute('data-file-type')
      }

      /* Remove a few css class which are typically used to hide things when online,
         but we want to see them when offline */
      filtersConfig.cssClassCallsBlackList.map((classname: string) => {
        if (node.getAttribute('class')) {
          node.setAttribute('class', node.getAttribute('class').replace(classname, ''))
        }
      })
    }

    const kartographerMaplinkNodes = Array.from<DominoElement>(parsoidDoc.querySelectorAll('.mw-kartographer-maplink')).filter((n) => !!n.textContent)
    for (const node of kartographerMaplinkNodes) {
      node.textContent = '🌍'
    }
  }

  private applyOtherTreatments(parsoidDoc: DominoElement, dump: Dump, articleId: string) {
    const filtersConfig = config.filters
    this.clearLinkAndInputTags(parsoidDoc, filtersConfig, dump)

    /* Go through all reference calls */
    const spans: DominoElement[] = Array.from(parsoidDoc.getElementsByTagName('span'))
    for (const span of spans) {
      const rel = span.getAttribute('rel')
      if (rel === 'dc:references') {
        const sup = parsoidDoc.createElement('sup')
        if (span.innerHTML) {
          sup.id = span.id
          sup.innerHTML = span.innerHTML
          span.parentNode.replaceChild(sup, span)
        } else {
          DU.deleteNode(span)
        }
      }
    }

    /* Go through all inline style and rewrite it */
    const styles: DominoElement[] = Array.from(parsoidDoc.getElementsByTagName('style'))
    for (const style of styles) {
      if (!style.textContent) {
        continue
      }
      // We use MediaWiki.baseUrl which is an approximation but it is deemed sufficient because
      // all non-absolute URL found in inline CSS are expected to be relative to the root, not to
      // current web URL which is "moving" (could use something like /w/index.php?title=... or /wiki/...)
      style.textContent = processStylesheetContent(MediaWiki.baseUrl.toString(), '', style.textContent, articleId)
    }

    /* Remove element with id in the blacklist */
    filtersConfig.idBlackList.forEach((id) => {
      const node = parsoidDoc.getElementById(id)
      if (node) {
        DU.deleteNode(node)
      }
    })

    /*
     * Because of CSP, some ZIM reader environments do not allow inline JS. See issues/2096.
     */
    const scripts = Array.from(parsoidDoc.getElementsByTagName('script')) as DominoElement[]
    for (const script of scripts) {
      script.parentNode.removeChild(script)
    }

    /* Force display of element with that CSS class */
    filtersConfig.cssClassDisplayList.map((classname: string) => {
      const nodes: DominoElement[] = Array.from(parsoidDoc.getElementsByClassName(classname))
      for (const node of nodes) {
        node.style.removeProperty('display')
      }
    })

    /* Remove empty paragraphs */
    if (!dump.opts.keepEmptyParagraphs) {
      const sections: DominoElement[] = Array.from(parsoidDoc.querySelectorAll('section'))
      for (const section of sections) {
        if (
          Array.from(section.children).filter((child: DominoElement) => {
            // Check if there is more than the expected children we have in all sections
            // RestApi : h2 tag
            // WikimediaDesktop, VisualEditor, Action Parse: mw-heading class
            // WikimediaMobile: pcs-edit-section-header class
            return !child.matches('h2') && !child.classList.contains('mw-heading') && !child.classList.contains('pcs-edit-section-header')
          }).length === 0
        ) {
          DU.deleteNode(section)
        }
      }
    }

    this.clearNodes(parsoidDoc, filtersConfig)
    return parsoidDoc
  }

  /**
   * Add an H1 tag with page title on top of article except main page
   */
  protected injectH1TitleToHtml(content: string, articleDetail: any): string {
    const doc = domino.createDocument(content)
    const header = doc.createElement('h1')

    if (articleDetail?.title) {
      header.appendChild(doc.createTextNode(articleDetail.title))
      header.classList.add('article-header')

      const target = doc.querySelector('body.mw-body-content')

      if (target) {
        target.insertAdjacentElement('afterbegin', header)
      }
    }

    return doc.documentElement.outerHTML
  }

  abstract download(downloadOpts: DownloadOpts): Promise<DownloadRes>
  abstract render(renderOpts: RenderOpts): Promise<any>
}
