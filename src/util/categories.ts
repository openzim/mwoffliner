import MediaWiki from '../MediaWiki.js'
import { Dump } from '../Dump.js'
import { interpolateTranslationString } from './misc.js'

export function buildCategoryMemberList(
  type: 'subcats' | 'pages' | 'files',
  categoryMembers: Array<CategoryMember>,
  articleDetail: ArticleDetail,
  doc: Document,
  dump: Dump,
  numericSorting: boolean,
): DominoElement {
  let idName, headerText, descText
  if (type === 'subcats') {
    idName = 'mw-subcategories'
    headerText = dump.strings.subcategories
    descText = dump.strings.categorySubcatCount
  } else if (type === 'pages') {
    idName = 'mw-pages'
    headerText = dump.strings.categoryHeader
    descText = dump.strings.categoryArticleCount
  } else if (type === 'files') {
    idName = 'mw-category-media'
    headerText = dump.strings.categoryMediaHeader
    descText = dump.strings.categoryFileCount
  }
  const categoryinfo = articleDetail.categoryinfo
  const section = doc.createElement('div')
  section.id = idName
  const header = doc.createElement('h2')
  header.textContent = interpolateTranslationString(headerText, {
    pageName: articleDetail.title.split(':').slice(1).join(':'),
  })
  section.appendChild(header)
  const desc = doc.createElement('p')
  desc.textContent = parsePlural(
    parsePlural(
      interpolateTranslationString(descText, {
        curPageCount: String(categoryinfo[type]),
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
  columns.classList.add('mw-category', 'mw-category-columns')
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
      filelink.classList.add('mw-file-description')
      filelink.setAttribute('href', MediaWiki.webUrl.pathname + encodeURIComponent(categoryMember.title))
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
      link.setAttribute('href', MediaWiki.webUrl.pathname + encodeURIComponent(categoryMember.title))
      link.setAttribute('title', categoryMember.title)
      link.textContent = pageName
      text.appendChild(link)
      member.appendChild(text)
      list.appendChild(member)
    } else {
      const member = doc.createElement('li')
      const link = doc.createElement('a')
      link.setAttribute('href', MediaWiki.webUrl.pathname + encodeURIComponent(categoryMember.title))
      link.setAttribute('title', categoryMember.title)
      link.textContent = type === 'subcats' ? categoryMember.title.split(':').slice(1).join(':') : categoryMember.title
      member.appendChild(link)
      list.appendChild(member)
    }
  }
  content.appendChild(columns)
  section.appendChild(content)
  return section
}

function parsePlural(text: string) {
  if (!text.includes('PLURAL:')) return text
  return text.replace(/{{\s*PLURAL:\s*[+-]?(\d+)\s*\|\s*([^{}]*?)\s*}}/g, (m, number: string, cases: string) => {
    const args = cases.split(/\s*\|\s*/)
    if (parseInt(number, 10) === 1) return args[0]
    else return args.length > 1 ? args[1] : args[args.length - 1]
  })
}
