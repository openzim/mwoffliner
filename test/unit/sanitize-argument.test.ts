import { sanitize_all } from '../../src/sanitize-argument.js'

describe('Sanitize parameters', () => {
  const baseValidParams = {
    _: [],
    verbose: true,
    mwUrl: 'https://en.wikipedia.org',
    'mw-url': 'https://en.wikipedia.org',
    adminEmail: 'test@test.test',
    'admin-email': 'test@test.test',
    $0: 'node_modules/ts-node/dist/child/child-entrypoint.js',
  }

  describe('Duplicate parameter validation', () => {
    test('should throw if --verbose is used more than once', async () => {
      const params = {
        ...baseValidParams,
        verbose: [true, 'info'],
      }

      await expect(sanitize_all(params)).rejects.toThrow(/Parameter '--verbose' can only be used once/)
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

  test('rejects invalid URL', async () => {
    await expect(sanitize_all({ mwUrl: 'invalid-url', adminEmail: 'test@example.com' })).rejects.toThrow(/url/i)
  })
})
