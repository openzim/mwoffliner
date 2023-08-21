import * as domino from 'domino'
import * as logger from '../../Logger.js'
import * as QueryStringParser from 'querystring'
import htmlMinifier from 'html-minifier'
import MediaWiki from '../../MediaWiki.js'
import DOMUtils from '../../DOMUtils.js'
import DU from '../../DOMUtils.js'
import { config } from '../../config.js'
import { Dump } from '../../Dump.js'
import { rewriteUrlsOfDoc } from '../rewriteUrls.js'
import { footerTemplate, htmlTemplateCode } from '../../Templates.js'
import {
  getFullUrl,
  getMediaBase,
  getMimeType,
  getRelativeFilePath,
  isWebpCandidateImageMimeType,
  interpolateTranslationString,
  genCanonicalLink,
  genHeaderScript,
  genHeaderCSSLink,
  encodeArticleIdForZimHtmlUrl,
} from '../misc.js'

type renderType = 'auto' | 'desktop' | 'mobile' | 'specific'
type renderName = 'VisualEditor' | 'WikimediaDesktop' | 'WikimediaMobile'

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

export interface RenderOpts {
  data?: any
  redisStore: RS
  webp: boolean
  articleId?: string
  articleDetailXId?: RKVS<ArticleDetail>
  articleDetail?: ArticleDetail | string
  isMainPage?: boolean
}

export abstract class Renderer {
  private async treatVideo(
    dump: Dump,
    srcCache: KVS<boolean>,
    articleId: string,
    videoEl: DominoElement,
    webp: boolean,
  ): Promise<{ mediaDependencies: string[]; subtitles: string[] }> {
    /* Worth noting:
     - This function handles audio tags as well as video tags
     - Video tags are used for audio files too (as opposed to the audio tag)
     - When it's only audio, there will be a single OGG file
     - For video, we get multiple SOURCE tages with different resolutions */
    const mediaDependencies: string[] = []
    const subtitles: string[] = []

    /* Just delete video/audio element if the flavour requires it */
    if (dump.nopic || dump.novid || dump.nodet) {
      DOMUtils.deleteNode(videoEl)
      return { mediaDependencies, subtitles }
    }

    /* Firefox is not able to display correctly <video> nodes with a
     height < 40. In that case the controls are not displayed. */
    if (videoEl.getAttribute('height') && videoEl.getAttribute('height') < 40) {
      videoEl.setAttribute('height', '40')
    }

    /* Always show controls */
    videoEl.setAttribute('controls', '40')

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

    /* If no appropriate source video can be found, delete the video */
    if (!chosenVideoSourceEl) {
      logger.warn(`Unable to find an appropriate video/audio source for an media element in article '${articleId}'`)
      DOMUtils.deleteNode(videoEl)
      return { mediaDependencies, subtitles }
    }

    /* Remove useless 'resource' attribute */
    videoEl.removeAttribute('resource')

    /* Handle video poster */
    const posterUrl = videoEl.getAttribute('poster')
    if (posterUrl) {
      const videoPosterUrl = getFullUrl(posterUrl, MediaWiki.baseUrl)
      const newVideoPosterUrl = getRelativeFilePath(articleId, getMediaBase(videoPosterUrl, true), 'I')

      if (posterUrl) {
        videoEl.setAttribute('poster', isWebpCandidateImageMimeType(webp, getMimeType(newVideoPosterUrl)) ? newVideoPosterUrl + '.webp' : newVideoPosterUrl)
      }
      videoEl.removeAttribute('resource')

      if (!srcCache.hasOwnProperty(videoPosterUrl)) {
        srcCache[videoPosterUrl] = true
        mediaDependencies.push(videoPosterUrl)
      }
    }

    /* Download content, but avoid duplicate calls */
    const sourceUrl = getFullUrl(chosenVideoSourceEl.getAttribute('src'), MediaWiki.baseUrl)
    if (!srcCache.hasOwnProperty(sourceUrl)) {
      srcCache[sourceUrl] = true
      mediaDependencies.push(sourceUrl)
    }

    /* Set new URL for the video element */
    const fileBase = getMediaBase(sourceUrl, true)
    chosenVideoSourceEl.setAttribute('src', getRelativeFilePath(articleId, fileBase, 'I'))

    /* Scrape subtitle */
    for (const track of Array.from(videoEl.querySelectorAll('track'))) {
      subtitles.push(await this.treatSubtitle(track, articleId))
    }

    return { mediaDependencies, subtitles }
  }

  private async treatSubtitle(trackEle: DominoElement, articleId: string): Promise<string> {
    const subtitleSourceUrl = getFullUrl(trackEle.getAttribute('src'), MediaWiki.baseUrl)
    const { title, lang } = QueryStringParser.parse(subtitleSourceUrl) as { title: string; lang: string }
    // The source URL we get from Mediawiki article is in srt format, so we replace it to vtt which is standard subtitle trackformat for <track> src attribute.
    const vttFormatUrl = new URL(subtitleSourceUrl)
    vttFormatUrl.searchParams.set('trackformat', 'vtt')
    trackEle.setAttribute('src', `${getRelativeFilePath(articleId, title, '-')}-${lang}.vtt`)
    return vttFormatUrl.href
  }

  private treatImageFrames(dump: Dump, parsoidDoc: DominoElement, imageNode: DominoElement) {
    const image = imageNode.getElementsByTagName('img')[0] || imageNode.getElementsByTagName('video')[0]

    if (!this.shouldKeepNode(dump, imageNode, image)) {
      DOMUtils.deleteNode(imageNode)
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

  private async treatImage(dump: Dump, srcCache: KVS<boolean>, articleId: string, img: DominoElement, webp: boolean, redisStore: RS): Promise<{ mediaDependencies: string[] }> {
    const mediaDependencies: string[] = []

    if (!this.shouldKeepImage(dump, img)) {
      DOMUtils.deleteNode(img)
      return { mediaDependencies }
    }

    /* Remove image link */
    const linkNode = img.parentNode
    if (linkNode.tagName === 'A') {
      /* Check if the target is mirrored */
      const href = linkNode.getAttribute('href') || ''
      const title = MediaWiki.extractPageTitleFromHref(href)
      const keepLink = title && (await redisStore.articleDetailXId.exists(title))

      /* Under certain condition it seems that this is possible
       * to have parentNode == undefined, in this case this
       * seems preferable to remove the whole link+content than
       * keeping a wrong link. See for example this url
       * http://parsoid.wmflabs.org/ko/%EC%9D%B4%ED%9C%98%EC%86%8C */
      if (!keepLink) {
        if (linkNode.parentNode) {
          linkNode.parentNode.replaceChild(img, linkNode)
        } else {
          DOMUtils.deleteNode(img)
          return { mediaDependencies }
        }
      }
    }

    /* Rewrite image src attribute */
    const src = getFullUrl(img.getAttribute('src'), MediaWiki.baseUrl)
    let newSrc: string
    try {
      const resourceNamespace = 'I'
      const slashesInUrl = articleId.split('/').length - 1
      const upStr = '../'.repeat(slashesInUrl + 1)
      newSrc = `${upStr}${resourceNamespace}/` + getMediaBase(src, true)
      /* Download image, but avoid duplicate calls */
      if (!srcCache.hasOwnProperty(src)) {
        srcCache[src] = true
        mediaDependencies.push(src)
      }

      /* Change image source attribute to point to the local image */
      img.setAttribute('src', isWebpCandidateImageMimeType(webp, getMimeType(src)) ? newSrc + '.webp' : newSrc)

      /* Remove useless 'resource' attribute */
      img.removeAttribute('resource')

      /* Remove srcset */
      img.removeAttribute('srcset')
    } catch (err) {
      DOMUtils.deleteNode(img)
    }

    /* Add lazy loading */
    img.setAttribute('loading', 'lazy')

    return { mediaDependencies }
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

  private async treatMedias(parsoidDoc: DominoElement, dump: Dump, articleId: string, webp: boolean, redisStore: RS) {
    let mediaDependencies: string[] = []
    let subtitles: string[] = []
    /* Clean/rewrite image tags */
    const imgs = Array.from(parsoidDoc.getElementsByTagName('img'))
    const videos: DominoElement = Array.from(parsoidDoc.querySelectorAll('video, audio'))
    const srcCache: KVS<boolean> = {}

    for (const videoEl of videos) {
      // <video /> and <audio />
      const ret = await this.treatVideo(dump, srcCache, articleId, videoEl, webp)
      mediaDependencies = mediaDependencies.concat(ret.mediaDependencies)
      subtitles = subtitles.concat(ret.subtitles)
    }

    for (const imgEl of imgs) {
      const ret = await this.treatImage(dump, srcCache, articleId, imgEl, webp, redisStore)
      mediaDependencies = mediaDependencies.concat(ret.mediaDependencies)
    }

    /* Improve image frames */
    const figures = parsoidDoc.getElementsByTagName('figure')
    const spans = parsoidDoc.querySelectorAll('span[typeof~=mw:Image/Frameless],span[typeof~=mw:File/Frameless]')
    const imageNodes = Array.prototype.slice.call(figures).concat(Array.prototype.slice.call(spans))
    for (const imageNode of imageNodes) {
      this.treatImageFrames(dump, parsoidDoc, imageNode)
    }

    return { doc: parsoidDoc, mediaDependencies, subtitles }
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

  /**
   * TODO: add temporary workaround to bypass 'test/e2e/cmd.e2e.test.ts'
   * Once article treatments will be replaced to render() method,
   * there should not be a problem to access to MediaWiki singleton
   */
  private mw: typeof MediaWiki

  public async processArticleHtml(html: string, redisStore: RS, mw: any, dump: Dump, articleId: string, articleDetail: ArticleDetail, _moduleDependencies: any, webp: boolean) {
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
    doc = this.applyOtherTreatments(doc, dump)

    const tmRet = await this.treatMedias(doc, dump, articleId, webp, redisStore)

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

  private applyOtherTreatments(parsoidDoc: DominoElement, dump: Dump) {
    const filtersConfig = config.filters

    /* Don't need <link> and <input> tags */
    const nodesToDelete: Array<{ class?: string; tag?: string; filter?: (n: any) => boolean }> = [{ tag: 'link' }, { tag: 'input' }]

    /* Remove "map" tags if necessary */
    if (dump.nopic) {
      nodesToDelete.push({ tag: 'map' })
    }

    /* Remove useless DOM nodes without children */
    function emptyChildFilter(n: any) {
      return !n.innerHTML
    }
    nodesToDelete.push({ tag: 'li', filter: emptyChildFilter })
    nodesToDelete.push({ tag: 'span', filter: emptyChildFilter })

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

    /* Remove element with id in the blacklist */
    filtersConfig.idBlackList.forEach((id) => {
      const node = parsoidDoc.getElementById(id)
      if (node) {
        DU.deleteNode(node)
      }
    })

    /* Force display of element with that CSS class */
    filtersConfig.cssClassDisplayList.map((classname: string) => {
      const nodes: DominoElement[] = Array.from(parsoidDoc.getElementsByClassName(classname))
      for (const node of nodes) {
        node.style.removeProperty('display')
      }
    })

    /* Remove empty paragraphs */
    // TODO: Refactor this option to work with page/html and page/mobile-html output. See issues/1866
    if (!dump.opts.keepEmptyParagraphs) {
      if (!dump.opts.keepEmptyParagraphs) {
        // Mobile view === details
        // Desktop view === section
        const sections: DominoElement[] = Array.from(parsoidDoc.querySelectorAll('details, section'))
        for (const section of sections) {
          if (
            section.children.length ===
            Array.from(section.children).filter((child: DominoElement) => {
              return child.matches('summary')
            }).length
          ) {
            DU.deleteNode(section)
          }
        }
      }
    }

    /* Clean the DOM of all uncessary code */
    const allNodes: DominoElement[] = Array.from(parsoidDoc.getElementsByTagName('*'))
    for (const node of allNodes) {
      node.removeAttribute('data-parsoid')
      node.removeAttribute('typeof')
      node.removeAttribute('about')
      node.removeAttribute('data-mw')

      if (node.getAttribute('rel') && node.getAttribute('rel').substr(0, 3) === 'mw:') {
        node.removeAttribute('rel')
      } else if (node.getAttribute('img')) {
        /* Remove a few images Parsoid attributes */
        node.removeAttribute('data-file-width')
        node.removeAttribute('data-file-height')
        node.removeAttribute('data-file-type')
      }

      /* Remove a few css calls */
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

    return parsoidDoc
  }

  render(renderOpts: RenderOpts): Promise<any> {
    /** TODO:
      1. Treat media.
      2. Process article HTML.
      3. Apply specific rendering transformations based on specific renderer.
     */
    const { data, redisStore, articleId, articleDetail, webp } = renderOpts
    if (data) {
      return this.processArticleHtml(data, redisStore, MediaWiki, Dump, articleId, articleDetail, _moduleDependencies, webp)
    }
  }
}
