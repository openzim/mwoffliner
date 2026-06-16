import MediaWiki from '../MediaWiki.js'
import { Dump } from '../Dump.js'

export function buildCategoryMemberList(
  type: 'subcats' | 'pages' | 'files',
  categoryMembers: Array<CategoryMember>,
  categoryinfo: CategoryInfo,
  articleDetail: ArticleDetail,
  doc: Document,
  dump: Dump,
  numericSorting: boolean,
): DominoElement {
  const count = categoryinfo[type]
  const pageName = articleDetail.title.split(':').slice(1).join(':')

  let idName: string
  let headerContent: string
  let descContent: string

  if (type === 'subcats') {
    idName = 'mw-subcategories'
    headerContent = dump.t('subcategories')
    descContent = dump.t('categorySubcatCount', { count, curPageCount: count })
  } else if (type === 'pages') {
    idName = 'mw-pages'
    headerContent = dump.t('categoryHeader', { pageName })
    descContent = dump.t('categoryArticleCount', { count, curPageCount: count })
  } else {
    idName = 'mw-category-media'
    headerContent = dump.t('categoryMediaHeader', { pageName })
    descContent = dump.t('categoryFileCount', { count, curPageCount: count })
  }

  const section = doc.createElement('div')
  section.id = idName
  const header = doc.createElement('h2')
  header.textContent = headerContent
  section.appendChild(header)
  const desc = doc.createElement('p')
  desc.textContent = descContent
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
  section.appendChild(content)
  return section
}
