import { startRedis, stopRedis } from './bootstrap.js';
import { Dump } from '../../src/Dump.js';

describe('Dump formats', () => {

  beforeAll(startRedis);
  afterAll(stopRedis);

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
  };

  for (const [format, expectedFormatTags] of Object.entries(formatTests)) {
    test(`tag [${expectedFormatTags}] is correct`, async () => {
      const dump = new Dump(format, {} as any, { creator: '', webUrl: 'https://en.wikipedia.org', langIso2: '' } as any);
      const outFormat = dump.computeFilenameRadical(true, false, true);

      expect(outFormat).toEqual(`_${expectedFormatTags}`);
    });
  }
});
