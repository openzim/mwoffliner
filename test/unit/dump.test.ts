import { Dump } from '../../src/Dump.js'

describe('Dump filename radical', () => {
  describe('Based on format', () => {
    const formatTests = {
      '': '',
      ':extra_alias_tag': '_extra_alias_tag',
      'nopic:nopic_alias': '_nopic_alias',
      'nopic,nopdf': '_nopic',
      'nopic,nopdf:pdf_alias': '_pdf_alias',
      'nopic,:extra_alias': '_extra_alias',
      'nopic:': '',
      'nopic,novid:': '',
      'nopic,nodet': '_nopic-nodet',
      'nodet,nopic': '_nopic-nodet',
    }

    for (const [format, expectedFormatTags] of Object.entries(formatTests)) {
      test(`tag [${expectedFormatTags}] is correct`, async () => {
        const dump = new Dump(format, {} as any, { creator: '', webUrl: 'https://en.wikipedia.org', langIso2: '' } as any)
        const outFormat = dump.computeFilenameRadical(true, false, true)

        expect(outFormat).toEqual(`_${expectedFormatTags}`)
      })
    }
  })

  describe('Based on article list', () => {
    const radicalTests = {
      Brian_May: 'brian-may',
      'Bob:Morane': 'bob-morane',
      'Brian,Bob,Morane': 'brian-bob-morane',
      'https://myhost.acme.com/mylist.tsv': 'mylist',
      'https://myhost.acme.com/mylist1.tsv,https://myhost.acme.com/mylist2.tsv': 'mylist2',
    }

    for (const [articleList, expectedRadicalSuffix] of Object.entries(radicalTests)) {
      test(`radical for article list [${articleList}] is correct`, async () => {
        const dump = new Dump('', { articleList } as any, { creator: '', webUrl: 'https://en.wikipedia.org', langIso2: 'en' } as any)
        const outFormat = dump.computeFilenameRadical(false, false, true)
        expect(outFormat).toEqual(`_en_${expectedRadicalSuffix}`)
      })
    }
  })

  describe('Based on placeholders', () => {
    const mwMetaData = {
      creator: 'Wikipedia',
      webUrl: 'https://en.wikipedia.org',
      langIso2: 'en',
      langIso3: 'eng',
      langVar: null,
    }

    test('default ZIM name uses language variant instead of language', async () => {
      const dump = new Dump('', {} as any, { ...mwMetaData, langVar: 'zh-cn' } as any)

      expect(dump.computeZimName()).toEqual('wikipedia_zh-cn_all')
    })

    test('custom ZIM name only changes metadata Name', async () => {
      const dump = new Dump('nodet,nopic', { customZimName: 'custom_{lang_or_variant}', filenameDate: '2026-04' } as any, mwMetaData as any)

      expect(dump.computeZimName()).toEqual('custom_en')
      expect(dump.computeFilenameRadical()).toEqual('wikipedia_en_all_nopic-nodet_2026-04')
    })

    test('custom ZIM name and filename are formatted with placeholders', async () => {
      const dump = new Dump(
        'novid:maxi',
        {
          articleList: 'https://myhost.acme.com/My_List.tsv',
          customZimName: '{domain}_{lang_or_variant}_{selection}',
          customZimFilename: '{zim_name}_{flavour}_{period}',
          filenameDate: '2026-04',
        } as any,
        { ...mwMetaData, langVar: 'sr-ec' } as any,
      )

      expect(dump.computeZimName()).toEqual('wikipedia_sr-ec_my-list')
      expect(dump.computeFilenameRadical()).toEqual('wikipedia_sr-ec_my-list_maxi_2026-04')
    })

    test('invalid placeholder fails with available placeholder list', async () => {
      const dump = new Dump('', { customZimName: '{missing}' } as any, mwMetaData as any)

      expect(() => dump.computeZimName()).toThrow(/Invalid placeholder \{missing\}.*domain/)
    })

    test('custom filename must stay a filename radical', async () => {
      const pathDump = new Dump('', { customZimFilename: '../{zim_name}', filenameDate: '2026-04' } as any, mwMetaData as any)

      expect(() => pathDump.computeFilenameRadical()).toThrow(/filename, not a path/)
    })

    test('filenamePrefix remains a legacy ZIM name and filename prefix', async () => {
      const dump = new Dump('nopic', { filenamePrefix: 'custom_prefix', filenameDate: '2026-04' } as any, mwMetaData as any)

      expect(dump.computeZimName()).toEqual('custom_prefix')
      expect(dump.computeFilenameRadical()).toEqual('custom_prefix_nopic_2026-04')
    })
  })
})
