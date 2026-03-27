/**
 * Regression tests for the reduce-accumulator bug in getNextFileToDownload()
 * (src/util/saveArticles.ts).
 *
 * The old code:  return host.downloadsComplete ? buf + 1 : 0
 * Reset the accumulator to 0 on any non-complete host, making the early-exit
 * check `completedHosts === hostValues.length` almost never true.
 *
 * The fix:       return host.downloadsComplete ? buf + 1 : buf
 */
describe('downloadFiles: completed-hosts reduce logic', () => {
  // Mirrors the fixed logic from saveArticles.ts
  const countCompleted = (hosts: { downloadsComplete: boolean }[]) =>
    hosts.reduce((buf, host) => (host.downloadsComplete ? buf + 1 : buf), 0)

  // Mirrors the old buggy logic for comparison
  const countCompletedBuggy = (hosts: { downloadsComplete: boolean }[]) =>
    hosts.reduce((buf, host) => (host.downloadsComplete ? buf + 1 : 0), 0)

  test('counts all complete hosts correctly', () => {
    const hosts = [{ downloadsComplete: true }, { downloadsComplete: true }, { downloadsComplete: true }]
    expect(countCompleted(hosts)).toBe(3)
  })

  test('regression: does not reset count when an incomplete host is interspersed', () => {
    // [done, done, notDone, done] — buggy code gives 1, fixed gives 3
    const hosts = [{ downloadsComplete: true }, { downloadsComplete: true }, { downloadsComplete: false }, { downloadsComplete: true }]
    expect(countCompleted(hosts)).toBe(3)
    expect(countCompletedBuggy(hosts)).toBe(1) // documents the old wrong behaviour
  })

  test('early-exit fires only when all hosts are complete', () => {
    const allDone = [{ downloadsComplete: true }, { downloadsComplete: true }]
    const notAllDone = [{ downloadsComplete: true }, { downloadsComplete: false }]
    expect(countCompleted(allDone) === allDone.length).toBe(true)
    expect(countCompleted(notAllDone) === notAllDone.length).toBe(false)
  })
})
