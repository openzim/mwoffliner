import * as domino from 'domino'
import * as logger from '../Logger.js'
import { Renderer } from './abstract.renderer.js'
import { getStrippedTitleFromHtml } from '../util/misc.js'
import { RenderOpts, RenderOutput } from './abstract.renderer.js'
import { categoriesTemplate, leadSectionTemplate, sectionTemplate, subCategoriesTemplate, subPagesTemplate, subSectionTemplate } from '../Templates.js'

// Represent 'https://{wikimedia-wiki}/api/rest_v1/page/html/'
export class WikimediaMobileRenderer extends Renderer {
  constructor() {
    super()
  }

  private async retrieveHtml(renderOpts: RenderOpts): Promise<any> {
    const { data, articleId, articleDetail, isMainPage } = renderOpts

    const html = isMainPage ? data : super.injectH1TitleToHtml(data, articleDetail)
    const strippedTitle = getStrippedTitleFromHtml(html)
    const displayTitle = strippedTitle || articleId.replace('_', ' ')

    return { html, displayTitle }
  }

  public async render(renderOpts: RenderOpts): Promise<any> {
    try {
      const result: RenderOutput = []
      const { data, articleId, webp, _moduleDependencies, isMainPage, dump } = renderOpts
      const articleDetail = await renderOpts.articleDetailXId.get(articleId)

      const { html, displayTitle } = await this.retrieveHtml(renderOpts)
      if (html) {
        let dataWithHeader = ''
        if (!isMainPage) {
          dataWithHeader = super.injectH1TitleToHtml(data, articleDetail)
        }
        // TODO: do mobile page transformations before applying other treatments
        const { finalHTML, subtitles, mediaDependencies } = await super.processHtml(dataWithHeader || data, dump, articleId, articleDetail, _moduleDependencies, webp)

        result.push({
          articleId,
          displayTitle,
          html: finalHTML,
          mediaDependencies,
          subtitles,
        })
        return result
      }
    } catch (err) {
      logger.error(err.message)
      throw new Error(err.message)
    }
  }

  // TODO: work in progress
  private treatSections(data: any, dump: Dump, articleId: string, displayTitle: string, articleDetail: ArticleDetail): string {
    const doc = domino.createDocument(data)

    let html = ''

    // set the first section (open by default)
    html += leadSectionTemplate({
      lead_display_title: displayTitle,
      lead_section_text: doc.querySelector('section[data-mw-section-id="0"]').innerHTML,
      strings: dump.strings,
    })

    // Get only top remain setions except first one
    // Calculate toclevel to handle nesting. To do so you need to traverse DOM recursevely

    // set all other section (closed by default)
    if (!dump.nodet && json.remaining.sections.length > 0) {
      const firstTocLevel = json.remaining.sections[0].toclevel
      json.remaining.sections.forEach((oneSection: any, i: number) => {
        if (oneSection.toclevel === firstTocLevel) {
          html = html.replace(`__SUB_LEVEL_SECTION_${i}__`, '') // remove unused anchor for subsection
          html += sectionTemplate({
            section_index: i + 1,
            section_id: oneSection.id, // Get from data-mw-section-id attribute
            section_anchor: oneSection.anchor, // Anchor of the heading, id attr of the heading in html
            section_line: oneSection.line, // this is the textContent() from the title. Check mobileapps for reference (checked)
            section_text: oneSection.text, // this is the innerHTML of the section, refer to mobileapps
            strings: dump.strings, // TODO: investigate
          })
        } else {
          html = html.replace(
            `__SUB_LEVEL_SECTION_${i}__`,
            subSectionTemplate({
              section_index: i + 1,
              section_toclevel: oneSection.toclevel + 1,
              section_id: oneSection.id,
              section_anchor: oneSection.anchor,
              section_line: oneSection.line,
              section_text: oneSection.text,
              strings: dump.strings,
            }),
          )
        }
      })
    }

    // For section index
    /**
     * Iterate over parent and nested sections separately and set section_index. For parent = 1, and nested 2..n respectively
     */

    // For id
    /**
     *	const sectionNumberString = sectionElement && sectionElement.getAttribute('data-mw-section-id');
	      return sectionNumberString ? parseInt(sectionNumberString, 10) : undefined;
     */

    // For line
    /**
     * node.innerHTML.trim()
     */

    // For section text
    /**
      if (node.nodeType === NodeType.TEXT_NODE) {
        currentSection.text += node.textContent;
      } else {
        currentSection.text += node.outerHTML;
      }
     */

    // For anchor
    /**
     * node.getAttribute('id');
     */

    const articleResourceNamespace = 'A'
    const categoryResourceNamespace = 'U'
    const slashesInUrl = articleId.split('/').length - 1
    const upStr = '../'.repeat(slashesInUrl + 1)
    if (articleDetail.subCategories && articleDetail.subCategories.length) {
      const subCategories = articleDetail.subCategories.map((category) => {
        return {
          name: category.title.split(':').slice(1).join(':'),
          url: `${upStr}${categoryResourceNamespace}/${category.title}`,
        }
      })

      const groups = this.groupAlphabetical(subCategories)

      html += subCategoriesTemplate({
        strings: dump.strings,
        groups,
        prevArticleUrl: articleDetail.prevArticleId ? `${upStr}${categoryResourceNamespace}/${articleDetail.prevArticleId}` : null,
        nextArticleUrl: articleDetail.nextArticleId ? `${upStr}${categoryResourceNamespace}/${articleDetail.nextArticleId}` : null,
      })
    }

    if (articleDetail.pages && articleDetail.pages.length) {
      const pages = articleDetail.pages.map((page) => {
        return {
          name: page.title,
          url: `${upStr}${articleResourceNamespace}/${page.title}`,
        }
      })

      const groups = this.groupAlphabetical(pages)

      html += subPagesTemplate({
        strings: dump.strings,
        groups,
      })
    }

    if (articleDetail.categories && articleDetail.categories.length) {
      const categories = articleDetail.categories.map((category) => {
        return {
          name: category.title.split(':').slice(1).join(':'),
          url: `${upStr}${categoryResourceNamespace}/${category.title}`,
        }
      })
      html += categoriesTemplate({
        strings: dump.strings,
        categories,
      })
    }
    html = html.replace(`__SUB_LEVEL_SECTION_${json.remaining.sections.length}__`, '') // remove the last subcestion anchor (all other anchor are removed in the forEach)
    return html
  }

  private groupAlphabetical(items: PageRef[]) {
    const groupsAlphabetical = items.reduce((acc: any, item) => {
      const groupId = item.name[0].toLocaleUpperCase()
      acc[groupId] = (acc[groupId] || []).concat(item)
      return acc
    }, {})

    return Object.keys(groupsAlphabetical)
      .sort()
      .map((letter) => {
        return {
          title: letter,
          items: groupsAlphabetical[letter],
        }
      })
  }
}
