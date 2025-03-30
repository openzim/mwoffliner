import { startRedis, stopRedis } from './bootstrap.js'
import { Dump } from '../../src/Dump.js'

describe('Dump filename radical', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

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
      'nopic,nodet': '_nopic_nodet',
      'nodet,nopic': '_nopic_nodet',
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
})
