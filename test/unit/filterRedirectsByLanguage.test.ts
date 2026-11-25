import { filterRedirectsByLanguage } from '../../src/util/mw-api.js'
import Downloader from '../../src/Downloader.js'
import { jest } from '@jest/globals'

// A redirect as processPagesAndSaveToRedis builds it. Only `from` is looked up.
const redirect = (from: string, to = 'Rsync') => ({ from, to }) as any

// Stand in for the API answering prop=info about the redirect titles.
const mockInfo = (languages: Record<string, string | undefined>) =>
  jest.spyOn(Downloader, 'getPagesByTitle').mockImplementation(
    async (titles: any) =>
      (titles as string[]).map((title) => ({
        title,
        ...(languages[title] ? { pagelanguagehtmlcode: languages[title] } : {}),
      })) as any,
  ) as any

afterEach(() => {
  jest.restoreAllMocks()
})

describe('filterRedirectsByLanguage', () => {
  it('makes no request and changes nothing when no language is requested', async () => {
    const spy = mockInfo({})
    const redirects = [redirect('Rsync (Italiano)')]
    expect(await filterRedirectsByLanguage(redirects, [])).toEqual(redirects)
    expect(spy).not.toHaveBeenCalled()
  })

  it('makes no request for an empty redirect list', async () => {
    const spy = mockInfo({})
    expect(await filterRedirectsByLanguage([], ['en'])).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('drops redirects whose page language is not wanted', async () => {
    mockInfo({ 'Rsync backup': 'en', 'Rsync (Italiano)': 'it', 'OpenSSH (Magyar)': 'hu' })
    const kept = await filterRedirectsByLanguage([redirect('Rsync backup'), redirect('Rsync (Italiano)'), redirect('OpenSSH (Magyar)')], ['en'])
    expect(kept.map((r) => r.from)).toEqual(['Rsync backup'])
  })

  it('accepts several languages', async () => {
    mockInfo({ A: 'en', B: 'it', C: 'hu' })
    const kept = await filterRedirectsByLanguage([redirect('A'), redirect('B'), redirect('C')], ['en', 'it'])
    expect(kept.map((r) => r.from)).toEqual(['A', 'B'])
  })

  // Same rule as for pages: this must narrow a scrape, never empty one. A wiki
  // that does not report the field would otherwise lose all its redirects.
  it('keeps a redirect whose language the API does not report', async () => {
    mockInfo({ Known: 'it' })
    const kept = await filterRedirectsByLanguage([redirect('Known'), redirect('Unreported')], ['en'])
    expect(kept.map((r) => r.from)).toEqual(['Unreported'])
  })

  // followRedirects must be false, or the API describes each redirect's TARGET
  // and every redirect would inherit the target's language, which is exactly
  // the language being kept, so nothing would ever be filtered.
  it('asks about the redirects themselves, not their targets', async () => {
    const spy = mockInfo({ 'Rsync (Italiano)': 'it' })
    await filterRedirectsByLanguage([redirect('Rsync (Italiano)')], ['en'])
    expect(spy).toHaveBeenCalledWith(['Rsync (Italiano)'], false, false)
  })

  it('asks about each title once', async () => {
    const spy = mockInfo({ Dup: 'en' })
    await filterRedirectsByLanguage([redirect('Dup', 'A'), redirect('Dup', 'B')], ['en'])
    expect(spy).toHaveBeenCalledTimes(1)
    expect((spy.mock.calls[0] as any)[0]).toEqual(['Dup'])
  })

  // MediaWiki caps a titles= query at 50 for an ordinary client and silently
  // truncates beyond it, so an unbatched lookup would report no language for
  // everything past the cap, and those would all be kept.
  it('batches lookups at the API limit', async () => {
    const spy = mockInfo({})
    const redirects = Array.from({ length: 120 }, (_, i) => redirect(`R${i}`))
    await filterRedirectsByLanguage(redirects, ['en'])
    expect(spy).toHaveBeenCalledTimes(3)
    for (const call of spy.mock.calls) {
      expect((call as any)[0].length).toBeLessThanOrEqual(50)
    }
  })
})
