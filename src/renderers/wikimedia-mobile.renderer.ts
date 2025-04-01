import * as domino from 'domino'
import urlJoin from 'url-join'
import * as logger from '../Logger.js'
import { MobileRenderer } from './abstractMobile.render.js'
import { getStrippedTitleFromHtml } from '../util/misc.js'
import { DownloadOpts, DownloadRes, RenderOpts, RenderOutput } from './abstract.renderer.js'

type PipeFunction = (value: DominoElement) => DominoElement | Promise<DominoElement>

const THUMB_WIDTH_REGEX = /\/(\d+)px-[^/]+$/
const THUMB_MAX_DIMENSION = 320

declare interface ImageMetadata {
  src: string | null
  width: number
  height: number
}

// Represent 'https://{wikimedia-wiki}/api/rest_v1/page/mobile-html/'
export class WikimediaMobileRenderer extends MobileRenderer {
  constructor() {
    super()
  }

  private getStrippedTitle(renderOpts: RenderOpts): string {
    const { data, articleId } = renderOpts

    const strippedTitle = getStrippedTitleFromHtml(data)
    return strippedTitle || articleId.replace('_', ' ')
  }

  public async download(downloadOpts: DownloadOpts): Promise<DownloadRes> {
    const { downloader, articleUrl, articleDetail } = downloadOpts

    const moduleDependencies = super.filterWikimediaMobileModules(await downloader.getModuleDependencies(articleDetail.title))

    const data = await downloader.getJSON<any>(articleUrl)
    /* istanbul ignore if */
    if (data.error) {
      throw data.error
    }

    return { data, moduleDependencies }
  }

  public async render(renderOpts: RenderOpts): Promise<any> {
    try {
      const result: RenderOutput = []
      const { data, articleId, moduleDependencies, dump } = renderOpts
      const articleDetail = await renderOpts.articleDetailXId.get(articleId)

      const displayTitle = this.getStrippedTitle(renderOpts)
      /* istanbul ignore else */
      if (data) {
        let mediaDependenciesVal
        let videoDependenciesVal
        let imageDependenciesVal
        let subtitlesVal
        const mobileHTML = domino.createDocument(data)
        const finalHTMLMobile = await this.pipeMobileTransformations(
          mobileHTML,
          this.INTERNAL.convertLazyLoadToImages,
          this.removeEditContainer,
          this.removeHiddenClass,
          this.INTERNAL.unhideSections,
          async (doc) => {
            const { finalHTML, subtitles, mediaDependencies, videoDependencies, imageDependencies } = await super.processHtml(
              doc.documentElement.outerHTML,
              dump,
              articleId,
              articleDetail,
              moduleDependencies,
              super.templateMobileArticle.bind(this),
            )

            mediaDependenciesVal = mediaDependencies
            imageDependenciesVal = imageDependencies
            videoDependenciesVal = videoDependencies
            subtitlesVal = subtitles
            return domino.createDocument(finalHTML)
          },
          this.restoreLinkDefaults,
        )

        result.push({
          articleId,
          displayTitle,
          html: finalHTMLMobile.documentElement.outerHTML,
          mediaDependencies: mediaDependenciesVal,
          videoDependencies: videoDependenciesVal,
          imageDependencies: imageDependenciesVal,
          moduleDependencies,
          staticFiles: this.staticFilesListMobile,
          subtitles: subtitlesVal,
        })
        return result
      } else {
        throw new Error(`Cannot render [${data}] into an article`)
      }
    } catch (err) {
      logger.error(err.message)
      throw err
    }
  }

  private async pipeMobileTransformations(value: DominoElement, ...fns: PipeFunction[]): Promise<DominoElement> {
    let result: DominoElement | Promise<DominoElement> = value
    for (const fn of fns) {
      result = fn(await result)
    }
    return result
  }

  private removeEditContainer(doc: DominoElement) {
    const editContainers = doc.querySelectorAll('.pcs-edit-section-link-container')

    editContainers.forEach((elem: DominoElement) => {
      elem.remove()
    })

    return doc
  }

  private calculateImageDimensions(span: DominoElement) {
    // These are the attributes that were "prepared" for us by the mobile-html endpoint.
    const preparedData = {
      src: span.getAttribute('data-src'),
      width: parseInt(span.getAttribute('data-width') || '0', 10),
      height: parseInt(span.getAttribute('data-height') || '0', 10),
    }

    if (preparedData.width === 0 || preparedData.height === 0) {
      return { preparedData: null, originalData: null, maxData: null }
    }

    // Calculate the ratio so we know if we're scaling down in the width or height dimension.
    const widthHeightRatio = preparedData.width / preparedData.height
    const scaleUsingHeight = widthHeightRatio > 1.0

    // The data-data-file-original-src attribute is the URL of the image that was used in the original article.
    // It is preferred over the data-src attribute, which is a "mobile" image that may be scaled up in order to
    // be "full width" on mobile devices. However, if the mobile API didn't scale the image up, then the
    // data-data-file-original-src attribute will be missing, and we should use the data-src.
    // See https://github.com/openzim/mwoffliner/issues/1925.
    let originalData: ImageMetadata | undefined
    const originalSrc = span.getAttribute('data-data-file-original-src')
    if (originalSrc) {
      // Try to match against an image URL with a width in it.
      const match = THUMB_WIDTH_REGEX.exec(originalSrc)
      if (match) {
        const originalWidth = parseInt(match[1], 10)
        originalData = {
          src: originalSrc,
          width: originalWidth,
          height: Math.round(originalWidth / widthHeightRatio),
        }
      }
    }

    let maxData: ImageMetadata | undefined
    if (scaleUsingHeight) {
      maxData = {
        src: null,
        width: Math.round(THUMB_MAX_DIMENSION * widthHeightRatio),
        height: THUMB_MAX_DIMENSION,
      }
    } else {
      maxData = {
        src: null,
        width: THUMB_MAX_DIMENSION,
        height: Math.round(THUMB_MAX_DIMENSION / widthHeightRatio),
      }
    }

    return {
      preparedData,
      originalData,
      maxData,
    }
  }

  private convertLazyLoadToImagesImpl(doc: DominoElement) {
    const protocol = 'https://'
    const spans = doc.querySelectorAll('.pcs-lazy-load-placeholder')

    spans.forEach((span: DominoElement) => {
      // Create a new img element that will replace the placeholder span.
      const img = doc.createElement('img') as DominoElement
      const { preparedData, originalData, maxData } = this.calculateImageDimensions(span)

      if (preparedData === null) {
        // The metadata for the lazy-loading span is something that we don't understand. Just copy the
        // data-src attribute to the img element and hope for the best.
        img.src = urlJoin(protocol, span.getAttribute('data-src'))
        img.setAttribute('decoding', 'async')
        img.className = span.getAttribute('data-class')
      } else {
        const widthToData = {
          [preparedData.width]: preparedData,
          [maxData.width]: maxData,
          [originalData?.width || 0]: originalData,
        }

        const minWidth = originalData ? Math.min(preparedData.width, maxData.width, originalData?.width) : Math.min(preparedData.width, maxData.width)
        let selectedData = widthToData[minWidth]
        if (selectedData === maxData) {
          // We've decided to scale down the image. Use URL hacking to create an image that scales to the size we want.
          if (originalData) {
            const match = THUMB_WIDTH_REGEX.exec(originalData.src)
            if (match) {
              selectedData.src = originalData.src.replace(`${match[1]}px`, `${selectedData.width}px`)
            }
          } else {
            // No original src, or original src cannot be URL hacked.
            const match = THUMB_WIDTH_REGEX.exec(preparedData.src)
            if (match) {
              selectedData.src = preparedData.src.replace(`${match[1]}px`, `${selectedData.width}px`)
            }
          }
        }

        if (selectedData.src === null) {
          // We couldn't find a URL to hack, so use the smaller of the original or prepared data.
          if (!originalData) {
            selectedData = preparedData
          } else {
            const newMinWidth = Math.min(preparedData.width, originalData.width)
            selectedData = widthToData[newMinWidth]
          }
        }

        img.src = urlJoin(protocol, selectedData.src)
        img.setAttribute('decoding', 'async')
        img.width = selectedData.width
        img.height = selectedData.height
        img.className = span.getAttribute('data-class')
      }

      // Replace the span with the img element
      span.parentNode.replaceChild(img, span)
    })

    return doc
  }

  private removeHiddenClass(doc: DominoElement) {
    const pcsSectionHidden = 'pcs-section-hidden'
    const hiddenSections = doc.querySelectorAll(`.${pcsSectionHidden}`)
    hiddenSections.forEach((section) => {
      section.classList.remove(pcsSectionHidden)
    })
    return doc
  }

  private unhideSectionsImpl(doc: DominoElement) {
    const sections = doc.querySelectorAll('section')
    Array.from(sections).forEach((section: DominoElement) => {
      // Domino doesn't allow us to easily manipulate specific styles. Rather than trying to parse
      // the style attribute and remove display: none, we just clobber the whole thing.
      section.style = ''
    })
    return doc
  }

  private restoreLinkDefaults(doc: DominoElement) {
    const supElements = doc.querySelectorAll('sup')

    Array.from(supElements).forEach((sup: DominoElement) => {
      const anchor = doc.createElement('a')
      const mwRefLinkTextElement = sup.querySelector('.mw-reflink-text') as DominoElement

      let mwRefLinkText = ''
      if (mwRefLinkTextElement) {
        mwRefLinkText = mwRefLinkTextElement.textContent || ''
      }

      const existedAnchor = sup.querySelector('.reference-link')

      if (existedAnchor?.getAttribute('href')) {
        anchor.setAttribute('href', existedAnchor.getAttribute('href'))
      }
      anchor.className = 'reference-link'
      anchor.textContent = mwRefLinkText

      sup.innerHTML = ''
      sup.appendChild(anchor)
    })

    return doc
  }

  public readonly INTERNAL = {
    convertLazyLoadToImages: this.convertLazyLoadToImagesImpl.bind(this),
    unhideSections: this.unhideSectionsImpl.bind(this),
  }
}
