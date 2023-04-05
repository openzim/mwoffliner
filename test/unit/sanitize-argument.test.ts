import { sanitize_all } from '../../src/sanitize-argument.js'

describe('Sanitize parameters', () => {
  test('sanitizing usage of the same parameter more than one time', async () => {
    // equivalent to command: node lib/cli.js --verbose --mwUrl="https://en.wikipedia.org" --adminEmail="test@test.test" --verbose=info
    const twoVerboseParameters = {
      _: [],
      verbose: [true, 'info'],
      mwUrl: 'https://en.wikipedia.org',
      'mw-url': 'https://en.wikipedia.org',
      adminEmail: 'test@test.test',
      'admin-email': 'test@test.test',
      $0: 'node_modules/ts-node/dist/child/child-entrypoint.js',
    }

    await expect(sanitize_all(twoVerboseParameters)).rejects.toThrow(/Parameter '--verbose' can only be used once/)

    // equivalent to command: node lib/cli.js --verbose --mwUrl="https://en.wikipedia.org" --adminEmail="test@test.test" --mwUrl="https://en.wikipedia.org"
    const twoUrlParameters = {
      _: [],
      verbose: true,
      mwUrl: ['https://en.wikipedia.org', 'https://en.wikipedia.org'],
      'mw-url': ['https://en.wikipedia.org', 'https://en.wikipedia.org'],
      adminEmail: 'test@test.test',
      'admin-email': 'test@test.test',
      $0: 'node_modules/ts-node/dist/child/child-entrypoint.js',
    }

    await expect(sanitize_all(twoUrlParameters)).rejects.toThrow(/Parameter '--mwUrl' can only be used once/)

    // equivalent to command: node lib/cli.js --verbose=info --adminEmail="est@test.test" --articleList="User:Kelson/MWoffliner_CI_reference" --mwUrl="https://en.m.wikipedia.org/" --format=nopic --format=nopdf --format=novid
    const threeFormatParameters = {
      _: [],
      verbose: 'info',
      adminEmail: 'test@test.test',
      'admin-email': 'test@test.test',
      articleList: 'User:Kelson/MWoffliner_CI_reference',
      'article-list': 'User:Kelson/MWoffliner_CI_reference',
      mwUrl: 'https://en.m.wikipedia.org/',
      'mw-url': 'https://en.m.wikipedia.org/',
      format: ['nopic', 'nopdf', 'novid'],
      $0: 'node_modules/ts-node/dist/child/child-entrypoint.js',
    }

    expect(await sanitize_all(threeFormatParameters)).toBeUndefined()
  })
})
