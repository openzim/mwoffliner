import { filterPages } from '../../src/util/mw-api.js'

// A page as prop=info returns it. Only the fields filterPages reads matter.
const page = (title: string, pagelanguagehtmlcode?: string) =>
  ({
    title,
    revisions: [{ revid: 1 }],
    contentmodel: 'wikitext',
    ...(pagelanguagehtmlcode ? { pagelanguagehtmlcode } : {}),
  }) as any

const titles = (pages: any[]) => pages.map((p) => p.title)

describe('filterPages', () => {
  const pages = [page('Rsync', 'en'), page('Rsync (Français)', 'fr'), page('Rsync (Русский)', 'ru'), page('Untagged page')]

  it('keeps every language when keepPageLanguages is empty', () => {
    expect(titles(filterPages(pages, [], ['wikitext']))).toEqual(['Rsync', 'Rsync (Français)', 'Rsync (Русский)', 'Untagged page'])
  })

  it('keeps only the requested language', () => {
    expect(titles(filterPages(pages, [], ['wikitext'], ['en']))).toEqual(['Rsync', 'Untagged page'])
  })

  it('accepts several languages', () => {
    expect(titles(filterPages(pages, [], ['wikitext'], ['en', 'fr']))).toEqual(['Rsync', 'Rsync (Français)', 'Untagged page'])
  })

  // A page reporting no language is KEPT. The field is absent rather than empty
  // on wikis that do not set it, so dropping those would silently empty the
  // scrape instead of failing visibly.
  it('keeps pages that declare no language', () => {
    expect(titles(filterPages([page('Untagged page')], [], ['wikitext'], ['en']))).toEqual(['Untagged page'])
  })

  // The language filter must compose with the existing ones rather than
  // replacing them.
  it('still applies the ignore list and the content-model filter', () => {
    const mixed = [page('Rsync', 'en'), page('Ignored', 'en'), { ...page('Module:Foo', 'en'), contentmodel: 'Scribunto' }, page('Rsync (Français)', 'fr')]
    expect(titles(filterPages(mixed, ['Ignored'] as any, ['wikitext'], ['en']))).toEqual(['Rsync'])
  })

  it('drops pages without revisions regardless of language', () => {
    const noRev = [{ title: 'Stub', contentmodel: 'wikitext', pagelanguagehtmlcode: 'en' } as any]
    expect(titles(filterPages(noRev, [], ['wikitext'], ['en']))).toEqual([])
  })
})
