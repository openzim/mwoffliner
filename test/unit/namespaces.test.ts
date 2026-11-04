import MediaWiki from '../../src/MediaWiki.js'

describe('MediaWiki.setNamespaces with string names and IDs', () => {
  beforeEach(() => {
    MediaWiki.reset()
  })

  const mockSiteInfo: any = {
    namespaces: {
      '-1': { id: -1, name: 'Special', canonical: 'Special' },
      '0': { id: 0, name: '', content: '' },
      '1': { id: 1, name: 'Talk', subpages: '', canonical: 'Talk' },
      '100': { id: 100, name: 'Portal', canonical: 'Portal' },
      '106': { id: 106, name: 'Thésaurus', canonical: 'Thesaurus' },
      '110': { id: 110, name: 'Thesaurus', canonical: 'Thesaurus' },
    },
    namespacealiases: [
      { id: 100, alias: 'P' },
      { id: 106, alias: 'Wiktionnaire:Thésaurus' },
    ],
  }

  test('includes namespaces by number in addNamespaces', () => {
    MediaWiki.setNamespaces(mockSiteInfo, [100], [])
    expect(MediaWiki.namespacesToMirror).toContain(100)
    expect(MediaWiki.namespacesToMirror).not.toContain(106)
  })

  test('includes namespaces by name (case-insensitive) in addNamespaces', () => {
    MediaWiki.setNamespaces(mockSiteInfo, ['thesaurus'], [])
    expect(MediaWiki.namespacesToMirror).toContain(106)
    expect(MediaWiki.namespacesToMirror).toContain(110)
  })

  test('includes namespaces by canonical name in addNamespaces', () => {
    MediaWiki.setNamespaces(mockSiteInfo, ['Thesaurus'], [])
    expect(MediaWiki.namespacesToMirror).toContain(106)
    expect(MediaWiki.namespacesToMirror).toContain(110)
  })

  test('includes only specified namespaces by name in onlyNamespaces', () => {
    MediaWiki.setNamespaces(mockSiteInfo, [], ['portal'])
    expect(MediaWiki.namespacesToMirror).toContain(100)
    expect(MediaWiki.namespacesToMirror).not.toContain(106)
  })

  test('includes only specified namespaces by number in onlyNamespaces', () => {
    MediaWiki.setNamespaces(mockSiteInfo, [], [100])
    expect(MediaWiki.namespacesToMirror).toContain(100)
    expect(MediaWiki.namespacesToMirror).not.toContain(106)
  })
})
