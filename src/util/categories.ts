import * as domino from 'domino'
import MediaWiki from '../MediaWiki.js'
import { Dump } from '../Dump.js'
import { interpolateTranslationString } from './misc.js'
import { rewriteUrlsOfDoc } from './rewriteUrls.js'
import { CATEGORIES_PAGE_SIZE } from './const.js'

export function buildCategoryIframe(type: 'subcats' | 'pages' | 'files', zimPath: string, articleDetail: ArticleDetail, doc: Document, dump: Dump): DominoElement {
  let idName, headerText
  if (type === 'subcats') {
    idName = 'mw-subcategories'
    headerText = dump.strings.subcategories
  } else if (type === 'pages') {
    idName = 'mw-pages'
    headerText = dump.strings.categoryHeader
  } else if (type === 'files') {
    idName = 'mw-category-media'
    headerText = dump.strings.categoryMediaHeader
  }
  const section = doc.createElement('div')
  section.id = idName
  const header = doc.createElement('h2')
  header.textContent = interpolateTranslationString(headerText, {
    pageName: articleDetail.title.split(':').slice(1).join(':'),
  })
  section.appendChild(header)
  const iframe = doc.createElement('iframe')
  iframe.src = `./${zimPath}`
  iframe.style = 'border-style: none; height: 100%; width:100%; overflow: hidden;'
  iframe.setAttribute('onload', 'attachIframe(this)')
  section.appendChild(iframe)
  return section
}

export function buildCategoryMemberList(
  type: 'subcats' | 'pages' | 'files',
  categoryMembers: Array<CategoryMember>,
  categoryinfo: CategoryInfo,
  articleDetail: ArticleDetail,
  doc: Document,
  dump: Dump,
  numericSorting: boolean,
  page: number,
  isLastPage: boolean,
): HTMLElement {
  let descText
  if (type === 'subcats') {
    descText = dump.strings.categorySubcatCount
  } else if (type === 'pages') {
    descText = dump.strings.categoryArticleCount
  } else if (type === 'files') {
    descText = dump.strings.categoryFileCount
  }
  const section = doc.createElement('div')
  const desc = doc.createElement('p')
  desc.textContent = parsePlural(
    parsePlural(
      interpolateTranslationString(descText, {
        curPageCount: String(categoryMembers.length),
        totalCount: String(categoryinfo[type]),
      }),
    ),
  )
  section.appendChild(desc)
  const content = doc.createElement('div')
  content.lang = articleDetail.pagelang
  content.dir = articleDetail.pagedir
  content.classList.add('mw-content-' + articleDetail.pagedir)
  const columns = doc.createElement('div')
  columns.classList.add('mw-category')
  if (categoryMembers.length > 6) columns.classList.add('mw-category-columns')
  let lastPrefix, column, list
  for (const categoryMember of categoryMembers) {
    const sortkeyPrefix = numericSorting && /^\d/.test(categoryMember.sortkeyprefix) ? dump.strings.categoryHeaderNumerals : categoryMember.sortkeyprefix
    if (lastPrefix !== sortkeyPrefix) {
      lastPrefix = sortkeyPrefix
      if (column) {
        column.appendChild(list)
        columns.appendChild(column)
      }
      column = doc.createElement('div')
      column.classList.add('mw-category-group')
      const groupHeader = doc.createElement('h3')
      groupHeader.textContent = sortkeyPrefix === ' ' ? '\u00A0' : sortkeyPrefix
      column.appendChild(groupHeader)
      list = doc.createElement('ul')
      if (type === 'files' && !categoryinfo.nogallery) {
        list.classList.add('gallery', 'mw-gallery-traditional')
      }
    }
    if (type === 'files' && !categoryinfo.nogallery) {
      const pageName = categoryMember.title.split(':').slice(1).join(':')
      const member = doc.createElement('li')
      member.classList.add('gallerybox')
      member.setAttribute('style', 'width: 155px')
      const thumb = doc.createElement('div')
      thumb.classList.add('thumb')
      thumb.setAttribute('style', 'width: 150px; height: 150px;')
      const span = doc.createElement('span')
      span.setAttribute('typeof', 'mw:File')
      const filelink = doc.createElement('a')
      filelink.target = '_parent'
      filelink.classList.add('mw-file-description')
      filelink.setAttribute('href', MediaWiki.webUrl.pathname + encodeURIComponent(categoryMember.title.replace(/ /g, '_')))
      const file = doc.createElement('img')
      file.classList.add('mw-file-description')
      // Special:Filepath work-around for file redirects
      file.setAttribute('src', MediaWiki.webUrl.pathname + encodeURIComponent(`Special:Filepath/${encodeURIComponent(pageName)}?width=120`))
      file.setAttribute('style', 'width: auto; height: auto; max-width: 120px; max-height: 120px;')
      file.setAttribute('width', '120')
      file.setAttribute('height', '120')
      file.setAttribute('decoding', 'async')
      file.setAttribute('loading', 'lazy')
      filelink.appendChild(file)
      span.appendChild(filelink)
      thumb.appendChild(span)
      member.appendChild(thumb)
      const text = doc.createElement('div')
      text.classList.add('gallerytext')
      const link = doc.createElement('a')
      link.target = '_parent'
      link.classList.add('galleryfilename', 'galleryfilename-truncate')
      link.setAttribute('href', MediaWiki.webUrl.pathname + encodeURIComponent(categoryMember.title.replace(/ /g, '_')))
      link.setAttribute('title', categoryMember.title)
      link.textContent = pageName
      text.appendChild(link)
      member.appendChild(text)
      list.appendChild(member)
    } else {
      const member = doc.createElement('li')
      const link = doc.createElement('a')
      link.target = '_parent'
      link.setAttribute('href', MediaWiki.webUrl.pathname + encodeURIComponent(categoryMember.title.replace(/ /g, '_')))
      link.setAttribute('title', categoryMember.title)
      link.textContent = type === 'subcats' ? categoryMember.title.split(':').slice(1).join(':') : categoryMember.title
      member.appendChild(link)
      list.appendChild(member)
    }
  }
  if (column) {
    column.appendChild(list)
    columns.appendChild(column)
  }
  content.appendChild(columns)
  section.appendChild(buildPaginationLinks(doc, page, isLastPage, dump))
  section.appendChild(content)
  section.appendChild(buildPaginationLinks(doc, page, isLastPage, dump))
  return section
}

export async function buildCategoryTypeItems(
  type: 'subcats' | 'pages' | 'files',
  categoryinfo: CategoryInfo,
  categoryMembers: GroupedCategoryMembers,
  articleZimPath: string,
  articleDetail: ArticleDetail,
  doc: Document,
  dump: Dump,
  numericSorting: boolean,
  moduleDependencies: { styleDependenciesList: string[] },
  callback: (moduleDependencies: any, zimPath: string) => any,
  articleId: string,
  categoryContent: HTMLElement,
  articleItems: Array<{ articleId: string; zimPath: string; zimTitle?: string; htmlContent: string }>,
): Promise<void> {
  if (!categoryinfo[type]) return
  if (type === 'files' && !categoryinfo.nogallery) {
    moduleDependencies.styleDependenciesList.push('mediawiki.page.gallery.styles')
  }
  let page = 1
  for (let start = 0; start < categoryinfo[type]; start += CATEGORIES_PAGE_SIZE) {
    const zimPath = `_categories_/${articleZimPath}/${type}/${page}`
    if (page === 1) {
      categoryContent.appendChild(buildCategoryIframe(type, zimPath, articleDetail, doc, dump))
    }
    const end = Math.min(start + CATEGORIES_PAGE_SIZE, categoryinfo[type] + 1)
    const section = buildCategoryMemberList(
      type,
      categoryMembers[type].slice(start, end),
      categoryinfo,
      articleDetail,
      doc,
      dump,
      numericSorting,
      page,
      end == categoryinfo[type] + 1,
    )
    const templateDoc = callback(moduleDependencies, zimPath)
    const typeDoc = domino.createDocument(templateDoc.documentElement.outerHTML)
    const mwContentText = typeDoc.getElementById('mw-content-text')
    mwContentText.lang = articleDetail.pagelang
    mwContentText.dir = articleDetail.pagedir
    mwContentText.classList.add('mw-content-' + articleDetail.pagedir)
    await rewriteUrlsOfDoc(section, zimPath, dump)
    mwContentText.innerHTML = section.innerHTML
    articleItems.push({
      articleId,
      zimPath,
      zimTitle: '',
      htmlContent: '<!DOCTYPE html>\n' + typeDoc.documentElement.outerHTML,
    })
    page++
  }
}

function buildPaginationLinks(doc: Document, page: number, isLastPage: boolean, dump: Dump): DocumentFragment {
  const fragment = doc.createDocumentFragment()
  if (page == 1 && isLastPage) {
    // No need for pagination links if there is only one page
    return fragment
  }
  fragment.appendChild(doc.createTextNode('('))
  if (page == 1) {
    fragment.appendChild(doc.createTextNode(dump.strings.categoryPreviousPage))
  } else {
    const link = doc.createElement('a')
    link.target = '_self'
    link.href = `./${page - 1}`
    link.textContent = dump.strings.categoryPreviousPage
    link.classList.add('mwo-norewrite')
    fragment.appendChild(link)
  }
  fragment.appendChild(doc.createTextNode(') ('))
  if (isLastPage) {
    fragment.appendChild(doc.createTextNode(dump.strings.categoryNextPage))
  } else {
    const link = doc.createElement('a')
    link.target = '_self'
    link.href = `./${page + 1}`
    link.textContent = dump.strings.categoryNextPage
    link.classList.add('mwo-norewrite')
    fragment.appendChild(link)
  }
  fragment.appendChild(doc.createTextNode(')'))
  return fragment
}

function parsePlural(text: string) {
  if (!text.includes('PLURAL:')) return text
  return text.replace(/{{\s*PLURAL:\s*[+-]?(\d+)\s*\|\s*([^{}]*?)\s*}}/g, (m, number: string, cases: string) => {
    const args = cases.split(/\s*\|\s*/)
    if (parseInt(number, 10) === 1) return args[0]
    else return args.length > 1 ? args[1] : args[args.length - 1]
  })
}
