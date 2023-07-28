import domino from 'domino'
import { categoriesTemplate, leadSectionTemplate, sectionTemplate, subCategoriesTemplate, subPagesTemplate, subSectionTemplate } from '../Templates.js'
import * as logger from '../Logger.js'
import type { Dump } from '../Dump.js'
import { MWCapabilities } from '../Downloader.js'
import { getStrippedTitleFromHtml } from './misc.js'
import { DELETED_ARTICLE_ERROR } from './const.js'

export enum ApiUrlType {
  Unknown = 'unknown',
  UseParsoid = 'useParsoid',
  MobileRest = 'mobileRest',
  DesktopRest = 'desktopRest',
  VE = 've',
}

export interface ApiUrl {
  url: string
  type: ApiUrlType
}

export const renderArticle = async (
  json: { type: ApiUrlType; data: any },
  articleId: string,
  dump: Dump,
  articleDetailXId: RKVS<ArticleDetail>,
  capabilities: MWCapabilities,
  articleDetailIn?: ArticleDetail,
): Promise<RenderedArticle[]> => {
  const articleDetail = articleDetailIn || (await articleDetailXId.get(articleId))
  const isMainPage = dump.isMainPage(articleId)

  if (json.type == ApiUrlType.UseParsoid) {
    const html = renderParsoidArticle(json, articleId, articleDetail, isMainPage)
    return [
      {
        articleId,
        displayTitle: articleId.replace('_', ' '),
        html,
      },
    ]
  }

  // Main Page is never ApiUrlType.MobileRest
  if (isMainPage || json.type == ApiUrlType.VE) {
    const html = json.type === ApiUrlType.DesktopRest ? json.data : renderDesktopArticle(json, articleId, articleDetail, isMainPage)
    const strippedTitle = getStrippedTitleFromHtml(html)
    return [
      {
        articleId,
        displayTitle: strippedTitle || articleId.replace('_', ' '),
        html,
      },
    ]
  }

  const result = []
  let html
  // Paginate when there are more than 200 subCategories
  const numberOfPagesToSplitInto = Math.max(Math.ceil((articleDetail.subCategories || []).length / 200), 1)
  for (let i = 0; i < numberOfPagesToSplitInto; i++) {
    const pageId = i === 0 ? '' : `__${i}`
    const _articleId = articleId + pageId
    const _articleDetail = Object.assign({}, articleDetail, {
      subCategories: (articleDetail.subCategories || []).slice(i * 200, (i + 1) * 200),
      nextArticleId: numberOfPagesToSplitInto > i + 1 ? `${articleId}__${i + 1}` : null,
      prevArticleId: i - 1 > 0 ? `${articleId}__${i - 1}` : i - 1 === 0 ? articleId : null,
    })

    if ((articleDetail.subCategories || []).length > 200) {
      await articleDetailXId.set(_articleId, _articleDetail)
    }

    if (json.type === ApiUrlType.DesktopRest) {
      html = json.data
    } else if (json.type === ApiUrlType.MobileRest) {
      html = renderMCSArticle(json.data, dump, _articleId, _articleDetail)
    }

    let strippedTitle = getStrippedTitleFromHtml(html)
    if (!strippedTitle) {
      const lead = json.type === ApiUrlType.MobileRest ? json.data.lead : null
      const title = (lead || { displaytitle: articleId }).displaytitle
      const doc = domino.createDocument(`<span class='mw-title'>${title}</span>`)
      strippedTitle = doc.getElementsByClassName('mw-title')[0].textContent
    }

    result.push({
      articleId: _articleId,
      displayTitle: (strippedTitle || articleId.replace(/_/g, ' ')) + (i === 0 ? '' : `/${i}`),
      html,
    })
  }

  return result
}

const injectHeader = (content: string, articleId: string, articleDetail: ArticleDetail): string => {
  const doc = domino.createDocument(content)
  const header = doc.createElement('h1')
  header.appendChild(doc.createTextNode(articleDetail.title))
  header.classList.add('article-header')
  const target = doc.querySelector('body')
  target.insertAdjacentElement('afterbegin', header)
  return doc.documentElement.outerHTML
}

export const renderParsoidArticle = (wrappedJson: { type: ApiUrlType; data: any }, articleId: string, articleDetail: ArticleDetail, isMainPage = false): string => {
  if (!wrappedJson || wrappedJson.type !== ApiUrlType.UseParsoid) {
    throw new Error(`Cannot render [${wrappedJson}] into an article`)
  }
  const json = wrappedJson.data
  // Testing if article has been deleted between fetching list and downloading content.
  if (json.parse.revid === 0) {
    logger.error(DELETED_ARTICLE_ERROR)
    throw new Error(DELETED_ARTICLE_ERROR)
  }
  return injectHeader(json.parse.text, articleId, articleDetail)
}

export const renderDesktopArticle = (wrappedJson: { type: ApiUrlType; data: any }, articleId: string, articleDetail: ArticleDetail, isMainPage = false): string => {
  if (!wrappedJson || !wrappedJson.type) {
    throw new Error(`Cannot render [${wrappedJson}] into an article`)
  }
  if (wrappedJson.type === ApiUrlType.VE) {
    const json = wrappedJson.data
    // Testing if article has been deleted between fetching list and downloading content.
    if (json.visualeditor.oldid === 0) {
      logger.error(DELETED_ARTICLE_ERROR)
      throw new Error(DELETED_ARTICLE_ERROR)
    }
    return isMainPage ? json.visualeditor.content : injectHeader(json.visualeditor.content, articleId, articleDetail)
  } else {
    logger.error(`Error in retrieved article [${articleId}]`)
    return ''
  }
}

const renderMCSArticle = (json: any, dump: Dump, articleId: string, articleDetail: ArticleDetail): string => {
  let html = ''

  // set the first section (open by default)
  html += leadSectionTemplate({
    lead_display_title: json.lead.displaytitle,
    lead_section_text: json.lead.sections[0].text,
    strings: dump.strings,
  })

  // set all other section (closed by default)
  if (!dump.nodet && json.remaining.sections.length > 0) {
    const firstTocLevel = json.remaining.sections[0].toclevel
    json.remaining.sections.forEach((oneSection: any, i: number) => {
      if (oneSection.toclevel === firstTocLevel) {
        html = html.replace(`__SUB_LEVEL_SECTION_${i}__`, '') // remove unused anchor for subsection
        html += sectionTemplate({
          section_index: i + 1,
          section_id: oneSection.id,
          section_anchor: oneSection.anchor,
          section_line: oneSection.line,
          section_text: oneSection.text,
          strings: dump.strings,
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

    const groups = groupAlphabetical(subCategories)

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

    const groups = groupAlphabetical(pages)

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

const groupAlphabetical = (items: PageRef[]) => {
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
