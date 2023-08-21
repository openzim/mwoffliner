// TODO: remove file later

import * as QueryStringParser from 'querystring'
import { Dump } from '../../Dump.js'
import MediaWiki from '../../MediaWiki.js'
import DOMUtils from '../../DOMUtils.js'
import * as logger from '../../Logger.js'
import { getFullUrl, getMediaBase, getMimeType, getRelativeFilePath, isWebpCandidateImageMimeType } from '../misc.js'

class MediaTreatment {
  async treatVideo(dump: Dump, srcCache: KVS<boolean>, articleId: string, videoEl: DominoElement, webp: boolean): Promise<{ mediaDependencies: string[]; subtitles: string[] }> {
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

  async treatSubtitle(trackEle: DominoElement, articleId: string): Promise<string> {
    const subtitleSourceUrl = getFullUrl(trackEle.getAttribute('src'), MediaWiki.baseUrl)
    const { title, lang } = QueryStringParser.parse(subtitleSourceUrl) as { title: string; lang: string }
    // The source URL we get from Mediawiki article is in srt format, so we replace it to vtt which is standard subtitle trackformat for <track> src attribute.
    const vttFormatUrl = new URL(subtitleSourceUrl)
    vttFormatUrl.searchParams.set('trackformat', 'vtt')
    trackEle.setAttribute('src', `${getRelativeFilePath(articleId, title, '-')}-${lang}.vtt`)
    return vttFormatUrl.href
  }

  treatImageFrames(dump: Dump, parsoidDoc: DominoElement, imageNode: DominoElement) {
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

  async treatImage(dump: Dump, srcCache: KVS<boolean>, articleId: string, img: DominoElement, webp: boolean, redisStore: RS): Promise<{ mediaDependencies: string[] }> {
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

  async treatMedias(parsoidDoc: DominoElement, dump: Dump, articleId: string, webp: boolean, redisStore: RS) {
    let mediaDependencies: string[] = []
    let subtitles: string[] = []
    /* Clean/rewrite image tags */
    const imgs = Array.from(parsoidDoc.getElementsByTagName('img'))
    const videos: DominoElement = Array.from(parsoidDoc.querySelectorAll('video, audio'))
    const srcCache: KVS<boolean> = {}

    for (const videoEl of videos) {
      // <video /> and <audio />
      const ret = await mediaTreatment.treatVideo(dump, srcCache, articleId, videoEl, webp)
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
      mediaTreatment.treatImageFrames(dump, parsoidDoc, imageNode)
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
}

const mediaTreatment = new MediaTreatment()

export default mediaTreatment
