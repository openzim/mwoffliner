import MediaWiki from '../MediaWiki.js'
import { Dump } from '../Dump.js'
import { config } from '../config.js'
import { rewriteUrlsOfDoc } from './rewriteUrls.js'

export function buildCategoryMemberList(
  type: 'subcats' | 'pages' | 'files',
  categoryMembers: Array<CategoryMember>,
  categoryinfo: CategoryInfo,
  pageDetail: PageDetail,
  doc: Document,
  dump: Dump,
  numericSorting: boolean,
  page: number,
  isLastPage: boolean,
  pagePath: string,
): HTMLElement {
  let idName: string
  let headerContent: string
  let descText: string
  const pageName = pageDetail.title.split(':').slice(1).join(':')
  if (type === 'subcats') {
    idName = 'mw-subcategories'
    headerContent = dump.t('subcategories')
    descText = dump.t('categorySubcatCount', { curPageCount: categoryMembers.length, count: categoryinfo[type] })
  } else if (type === 'pages') {
    idName = 'mw-pages'
    headerContent = dump.t('categoryHeader', { pageName })
    descText = dump.t('categoryPageCount', { curPageCount: categoryMembers.length, count: categoryinfo[type] })
  } else if (type === 'files') {
    idName = 'mw-category-media'
    headerContent = dump.t('categoryMediaHeader', { pageName })
    descText = dump.t('categoryFileCount', { curPageCount: categoryMembers.length, count: categoryinfo[type] })
  }
  const section = doc.createElement('div')
  section.id = idName
  const header = doc.createElement('h2')
  header.textContent = headerContent
  section.appendChild(header)
  const desc = doc.createElement('p')
  desc.textContent = descText
  section.appendChild(desc)
  const content = doc.createElement('div')
  content.lang = pageDetail.pagelang
  content.dir = pageDetail.pagedir
  content.classList.add('mw-content-' + pageDetail.pagedir)
  const columns = doc.createElement('div')
  columns.classList.add('mw-category')
  if (categoryMembers.length > 6) columns.classList.add('mw-category-columns')
  let lastPrefix, column, list
  for (const categoryMember of categoryMembers) {
    const sortkeyPrefix = numericSorting && /^\d/.test(categoryMember.sortkeyprefix) ? dump.t('categoryHeaderNumerals') : categoryMember.sortkeyprefix
    if (lastPrefix !== sortkeyPrefix) {
      lastPrefix = sortkeyPrefix
      if (column) {
        column.appendChild(list)
        columns.appendChild(column)
      }
      column = doc.createElement('div')
      column.classList.add('mw-category-group')
      const groupHeader = doc.createElement('h3')
      groupHeader.textContent = sortkeyPrefix === ' ' ? ' ' : sortkeyPrefix
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
  section.appendChild(buildPaginationDiv(doc, page, isLastPage, pagePath, type, idName, dump))
  section.appendChild(content)
  section.appendChild(buildPaginationDiv(doc, page, isLastPage, pagePath, type, idName, dump))
  return section
}

export async function buildCategoryTypeItems(
  type: 'subcats' | 'pages' | 'files',
  categoryinfo: CategoryInfo,
  categoryMembers: GroupedCategoryMembers,
  pagePath: ZimPath,
  pageDetail: PageDetail,
  doc: Document,
  dump: Dump,
  numericSorting: boolean,
  moduleDependencies: { styleDependenciesList: string[] },
  pageTitle: PageTitle,
  categoryContent: HTMLElement,
  pageItems: Array<RenderSingleOutput>,
): Promise<void> {
  if (!categoryinfo[type]) return
  if (type === 'files' && !categoryinfo.nogallery) {
    moduleDependencies.styleDependenciesList.push('mediawiki.page.gallery.styles')
  }
  let page = 1
  for (let start = 0; start < categoryinfo[type]; start += MediaWiki.categoriesPageSize) {
    const end = Math.min(start + MediaWiki.categoriesPageSize, categoryinfo[type])
    const isLastPage = end >= categoryinfo[type]
    const section = buildCategoryMemberList(type, categoryMembers[type].slice(start, end), categoryinfo, pageDetail, doc, dump, numericSorting, page, isLastPage, pagePath)
    if (page === 1) {
      // Append section directly to page itself if on first page so that noJS works fine
      categoryContent.appendChild(section)
    }

    if (!(page == 1 && isLastPage)) {
      // Save section in subdoc so that JS can load it (including first page so we can move back to it)
      // No need to do it if we have only one page, everything will be directly in the page

      const partialZimPath = `${config.output.dirs.categories_partials}${pagePath}_${type}_${page}` as ZimPath

      // Create a copy so we can alter it without altering current page content
      const partial = doc.createElement('div')
      partial.innerHTML = section.outerHTML

      // Rewrite URLs in partial
      await rewriteUrlsOfDoc(partial, partialZimPath, dump)

      pageItems.push({
        pageTitle: pageTitle,
        zimPath: partialZimPath,
        zimTitle: '',
        htmlContent: partial.innerHTML,
      })
    }
    page++
  }
}

function buildPaginationLink(doc: Document, targetPage: number, text: string, idName: string, partialUrl: string): HTMLAnchorElement {
  const link = doc.createElement('a')
  const url = `${partialUrl}_${targetPage}`
  link.setAttribute('onclick', `displayCategoryPartial('${idName}', '${url}')`)
  link.setAttribute('tabindex', '0')
  link.setAttribute('onkeydown', `if(event.key==='Enter') displayCategoryPartial('${idName}', '${url}')`)
  link.textContent = text
  link.classList.add('mwo-norewrite')
  return link
}

function buildPaginationDiv(doc: Document, page: number, isLastPage: boolean, pathPath: string, type: string, idName: string, dump: Dump): HTMLElement {
  const section = doc.createElement('div')
  section.classList.add('mwo-cat-pagination')

  const spanNoJS = doc.createElement('span')
  spanNoJS.classList.add('mwo-no-js')
  spanNoJS.textContent = dump.t('categoryNoPagination')
  section.appendChild(spanNoJS)

  const slashesInUrl = pathPath.split('/').length - 1
  const upStr = slashesInUrl ? '../'.repeat(slashesInUrl) : './'
  const partialUrl = `${upStr}${config.output.dirs.categories_partials}${pathPath}_${type}`

  const spanWithJS = doc.createElement('span')
  spanWithJS.classList.add('mwo-js')
  if (!(page == 1 && isLastPage)) {
    const fragment = doc.createDocumentFragment()
    fragment.appendChild(doc.createTextNode('('))
    fragment.appendChild(page == 1 ? doc.createTextNode(dump.t('categoryPreviousPage')) : buildPaginationLink(doc, page - 1, dump.t('categoryPreviousPage'), idName, partialUrl))
    fragment.appendChild(doc.createTextNode(') ('))
    fragment.appendChild(isLastPage ? doc.createTextNode(dump.t('categoryNextPage')) : buildPaginationLink(doc, page + 1, dump.t('categoryNextPage'), idName, partialUrl))
    fragment.appendChild(doc.createTextNode(')'))
    spanWithJS.appendChild(fragment)
  }
  section.appendChild(spanWithJS)
  return section
}
