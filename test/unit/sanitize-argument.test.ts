import { sanitize_all } from '../../src/sanitize-argument.js'

describe('Sanitize parameters', () => {
  const baseValidParams = {
    _: [],
    logLevel: 'info',
    mwUrl: 'https://en.wikipedia.org',
    'mw-url': 'https://en.wikipedia.org',
    adminEmail: 'test@test.test',
    'admin-email': 'test@test.test',
    $0: 'node_modules/ts-node/dist/child/child-entrypoint.js',
  }

  describe('Duplicate parameter validation', () => {
    test('should throw if --log-level is used more than once', async () => {
      const params = {
        ...baseValidParams,
        logLevel: ['info', 'debug'],
      }

      await expect(sanitize_all(params)).rejects.toThrow(/Parameter '--logLevel' can only be used once/)
    })

    test('should throw if --mwUrl is used more than once', async () => {
      const params = {
        ...baseValidParams,
        mwUrl: ['https://en.wikipedia.org', 'https://en.wikipedia.org'],
        'mw-url': ['https://en.wikipedia.org', 'https://en.wikipedia.org'],
      }

      await expect(sanitize_all(params)).rejects.toThrow(/Parameter '--mwUrl' can only be used once/)
    })
  })

  describe('--format parameter behavior', () => {
    test('should allow multiple --format values', async () => {
      const params = {
        ...baseValidParams,
        format: ['nopic', 'nopdf', 'novid'],
      }

      await expect(sanitize_all(params)).resolves.toBeUndefined()
    })
  })
})

describe('required variable check', () => {
  test('rejects empty mwUrl', async () => {
    await expect(sanitize_all({ mwUrl: '', adminEmail: 'test@example.com' })).rejects.toThrow(/mwurl/i)
  })

  test('rejects whitespace mwUrl', async () => {
    await expect(sanitize_all({ mwUrl: ' ', adminEmail: 'test@example.com' })).rejects.toThrow(/mwurl/i)
  })
  test('rejects empty adminEmail', async () => {
    await expect(sanitize_all({ mwUrl: 'https://en.wikipedia.org', adminEmail: '' })).rejects.toThrow(/email/i)
  })

  test('rejects whitespace adminEmail', async () => {
    await expect(sanitize_all({ mwUrl: 'https://en.wikipedia.org', adminEmail: '' })).rejects.toThrow(/email/i)
  })
})

describe('Email validation', () => {
  test('accepts valid email', async () => {
    await expect(sanitize_all({ adminEmail: 'test@example.com', mwUrl: 'https://en.wikipedia.org' })).resolves.toBeUndefined()
  })

  test('rejects invalid email', async () => {
    await expect(sanitize_all({ adminEmail: 'invalid-email', mwUrl: 'https://en.wikipedia.org' })).rejects.toThrow(/email/i)
  })
})

describe('URL validation', () => {
  test('accepts valid URL', async () => {
    await expect(sanitize_all({ mwUrl: 'https://en.wikipedia.org', adminEmail: 'test@example.com' })).resolves.toBeUndefined()
  })

  test('accepts valid URL with trailing slash', async () => {
    await expect(sanitize_all({ mwUrl: 'https://en.wikipedia.org/', adminEmail: 'test@example.com' })).resolves.toBeUndefined()
  })

  test('accepts valid http URL', async () => {
    await expect(sanitize_all({ mwUrl: 'http://en.wikipedia.org', adminEmail: 'test@example.com' })).resolves.toBeUndefined()
  })

  test('accepts valid URL with IP address', async () => {
    await expect(sanitize_all({ mwUrl: 'http://192.168.1.1', adminEmail: 'test@example.com' })).resolves.toBeUndefined()
  })

  test('rejects invalid URL', async () => {
    await expect(sanitize_all({ mwUrl: 'invalid-url', adminEmail: 'test@example.com' })).rejects.toThrow(/url/i)
  })

  test('rejects URL with non-http protocol', async () => {
    await expect(sanitize_all({ mwUrl: 'ftp://en.wikipedia.org', adminEmail: 'test@example.com' })).rejects.toThrow(/protocol/)
  })

  test('rejects URL with path', async () => {
    await expect(sanitize_all({ mwUrl: 'https://en.wikipedia.org/wiki', adminEmail: 'test@example.com' })).rejects.toThrow(/path/)
  })

  test('rejects URL with deep path', async () => {
    await expect(sanitize_all({ mwUrl: 'https://en.wikipedia.org/wiki/Main_Page', adminEmail: 'test@example.com' })).rejects.toThrow(/path/)
  })
})

describe('Speed validation', () => {
  const baseValidParams = {
    _: [],
    logLevel: 'info',
    mwUrl: 'https://en.wikipedia.org',
    'mw-url': 'https://en.wikipedia.org',
    adminEmail: 'test@test.test',
    'admin-email': 'test@test.test',
    $0: 'node_modules/ts-node/dist/child/child-entrypoint.js',
  }

  test('accepts positive integer speed', async () => {
    await expect(sanitize_all({ ...baseValidParams, speed: 4 })).resolves.toBeUndefined()
  })

  test('accepts integer string speed', async () => {
    await expect(sanitize_all({ ...baseValidParams, speed: '4' })).resolves.toBeUndefined()
  })

  test('accepts undefined speed (default)', async () => {
    await expect(sanitize_all({ ...baseValidParams })).resolves.toBeUndefined()
  })

  test('accepts float speed below 1', async () => {
    await expect(sanitize_all({ ...baseValidParams, speed: 0.1 })).resolves.toBeUndefined()
  })

  test('accepts string float speed below 1', async () => {
    await expect(sanitize_all({ ...baseValidParams, speed: '0.1' })).resolves.toBeUndefined()
  })

  test('rejects zero speed', async () => {
    await expect(sanitize_all({ ...baseValidParams, speed: 0 })).rejects.toThrow(/positive number/)
  })

  test('rejects negative speed', async () => {
    await expect(sanitize_all({ ...baseValidParams, speed: -1 })).rejects.toThrow(/positive number/)
  })

  test('rejects float speed above 1', async () => {
    await expect(sanitize_all({ ...baseValidParams, speed: 1.5 })).rejects.toThrow(/integers/)
  })

  test('rejects non-numeric speed', async () => {
    await expect(sanitize_all({ ...baseValidParams, speed: 'abc' })).rejects.toThrow(/positive number/)
  })
})
