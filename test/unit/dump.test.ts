import { createTranslator } from '../../src/i18n.js'
import { Dump } from '../../src/Dump.js'

describe('Dump filename radical', () => {
  const mwMetaData = {
    creator: 'Wikipedia',
    webUrl: 'https://en.wikipedia.org',
    langIso2: 'en',
    langIso3: 'eng',
    langVar: null,
  }
  let t
  beforeAll(async () => {
    t = await createTranslator(mwMetaData.langIso2 || 'en', 'en')
  })

  describe('Based on format', () => {
    const formatTests = {
      '': 'wikipedia_en_all_2026-04.zim',
      ':extra-alias-tag': 'wikipedia_en_all_extra-alias-tag_2026-04.zim',
      'nopic:nopic-alias': 'wikipedia_en_all_nopic-alias_2026-04.zim',
      'nopic,nopdf': 'wikipedia_en_all_nopic_2026-04.zim',
      'nopic,nopdf:pdf-alias': 'wikipedia_en_all_pdf-alias_2026-04.zim',
      'nopic,:extra-alias': 'wikipedia_en_all_extra-alias_2026-04.zim',
      'nopic:': 'wikipedia_en_all_2026-04.zim',
      'nopic,novid:': 'wikipedia_en_all_2026-04.zim',
      'nopic,nodet': 'wikipedia_en_all_nopic-nodet_2026-04.zim',
      'nodet,nopic': 'wikipedia_en_all_nopic-nodet_2026-04.zim',
    }

    for (const [format, expectedFilename] of Object.entries(formatTests)) {
      test(`format [${expectedFilename}] is correct`, async () => {
        const dump = new Dump(format, '', { filenameDate: '2026-04' } as any, mwMetaData as any, undefined, t)
        expect(dump.computeFilename()).toEqual(expectedFilename)
      })
    }
  })

  describe('Based on page list', () => {
    const radicalTests = {
      Brian_May: 'brian-may',
      'Bob:Morane': 'bob-morane',
      'Brian,Bob,Morane': 'brian-bob-morane',
      'https://myhost.acme.com/mylist.tsv': 'mylist',
      'https://myhost.acme.com/mylist1.tsv,https://myhost.acme.com/mylist2.tsv': 'mylist2',
    }

    for (const [pageList, expectedRadicalSuffix] of Object.entries(radicalTests)) {
      test(`radical for page list [${pageList}] is correct`, async () => {
        const dump = new Dump('', '', { pageList, filenameDate: '2026-04' } as any, mwMetaData as any, undefined, t)
        const outFormat = dump.computeFilename()
        expect(outFormat).toEqual(`wikipedia_en_${expectedRadicalSuffix}_2026-04.zim`)
      })
    }
  })

  describe('Based on format + page list', () => {
    test(`filename with format and page list is correct`, async () => {
      const dump = new Dump('novid', '', { pageList: 'Brian_May', filenameDate: '2026-04' } as any, mwMetaData as any, undefined, t)
      const outFormat = dump.computeFilename()
      expect(outFormat).toEqual(`wikipedia_en_brian-may_novid_2026-04.zim`)
    })
  })

  describe('Based on placeholders', () => {
    test('default ZIM name uses language variant instead of language', async () => {
      const dump = new Dump('', 'zh-cn', {} as any, mwMetaData as any, undefined, t)
      expect(dump.computeZimName()).toEqual('wikipedia_zh-cn_all')
    })

    test('custom ZIM name also changes filename by default', async () => {
      const dump = new Dump('nodet,nopic', '', { customZimName: 'custom_{lang_or_variant}', filenameDate: '2026-04' } as any, mwMetaData as any, undefined, t)

      expect(dump.computeZimName()).toEqual('custom_en')
      expect(dump.computeFilename()).toEqual('custom_en_nopic-nodet_2026-04.zim')
    })

    test('custom ZIM name and filename are formatted with placeholders', async () => {
      const dump = new Dump(
        'novid:maxi',
        'sr-ec',
        {
          pageList: 'https://myhost.acme.com/My_List.tsv',
          customZimName: '{domain}_{lang_or_variant}_{selection}',
          customZimFilename: '{zim_name}_{flavour}_{period}.zim',
          filenameDate: '2026-04',
        } as any,
        mwMetaData as any,
        undefined,
        t,
      )

      expect(dump.computeZimName()).toEqual('wikipedia_sr-ec_my-list')
      expect(dump.computeFilename()).toEqual('wikipedia_sr-ec_my-list_maxi_2026-04.zim')
    })

    test('invalid placeholder fails with available placeholder list', async () => {
      const dump = new Dump('', '', { customZimName: '{missing}.zim' } as any, mwMetaData as any, undefined, t)

      expect(() => dump.computeZimName()).toThrow(/Invalid placeholder \{missing\}.*domain/)
    })

    test('custom filename must not use a path', async () => {
      const pathDump = new Dump('', '', { customZimFilename: '../{zim_name}.zim', filenameDate: '2026-04' } as any, mwMetaData as any, undefined, t)
      expect(() => pathDump.computeFilename()).toThrow(/filename, not a path/)
    })

    test('custom filename must have zim extension', async () => {
      const pathDump = new Dump('', '', { customZimFilename: '{zim_name}_{flavour}_{period}', filenameDate: '2026-04' } as any, mwMetaData as any, undefined, t)
      expect(() => pathDump.computeFilename()).toThrow(/must include the \.zim extension/)
    })
  })
})
