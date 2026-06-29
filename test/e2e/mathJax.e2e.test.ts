import * as path from 'path'
import { fileURLToPath } from 'url'
import * as mwoffliner from '../../src/mwoffliner.lib.js'
import { execa } from 'execa'
import { rimraf } from 'rimraf'
import { jest } from '@jest/globals'
import domino from 'domino'
import { zimdump, zimcheck } from '../util.js'

jest.setTimeout(200000)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MATHJAX_ZIP = path.join(__dirname, 'assets/mathjax-test.zip')
const MATHJAX_CONFIG = path.join(__dirname, 'assets/mathjax-config.html')

// Terraria wiki uses ext.SimpleMathJax. The test page has math content only
// in its body — not in the lead section (section 0) used by nodet format.
describe('mathJax', () => {
  const now = new Date()
  const testId = `mwo-test-mathjax-${+now}`

  const baseParameters = {
    mwUrl: 'https://terraria.wiki.gg',
    adminEmail: 'test@kiwix.org',
    outputDirectory: testId,
    redis: process.env.REDIS,
    pageList: 'User:KiwixOffline/MWOffliner_Test',
    mwActionApiPath: '/api.php',
    forceRender: 'ActionParse',
    mathJaxSource: MATHJAX_ZIP,
    mathJaxConfig: MATHJAX_CONFIG,
    mathJaxEntryPoint: 'es5/tex-chtml.js',
  }

  afterAll(async () => {
    await execa('redis-cli flushall', { shell: true })
    if (!process.env.KEEP_ZIMS) {
      rimraf.sync(`./${testId}`)
    }
  })

  test('MathJax files are pushed to ZIM and scripts injected on page that needs MathJax (nopic)', async () => {
    const outFiles = await mwoffliner.execute({
      ...baseParameters,
      filenamePrefix: 'mathJax_nopic',
      format: ['nopic'],
    })
    const dump = outFiles[0]

    expect(dump.status.pages.success).toEqual(1)
    expect(dump.status.pages.hardFail).toEqual(0)
    expect(dump.status.pages.softFail).toEqual(0)

    await expect(zimcheck(dump.outFile)).resolves.not.toThrow()

    // MathJax runtime files from es5/ should be present in the ZIM
    const allFiles = (await zimdump(`list ${dump.outFile}`)).split('\n')
    const mathJaxFiles = allFiles.filter((f) => f.startsWith('_mathjax_/'))
    expect(mathJaxFiles).toContain('_mathjax_/es5/tex-chtml.js')
    expect(mathJaxFiles).toContain('_mathjax_/es5/output/chtml/chtml.js')

    // Non-runtime files (TypeScript sources, declaration files) must NOT be present
    expect(mathJaxFiles.some((f) => f.startsWith('_mathjax_/ts/'))).toBe(false)
    expect(mathJaxFiles.some((f) => f.startsWith('_mathjax_/js/'))).toBe(false)

    // Article HTML should contain the MathJax config inline script and entry-point <script>
    const pageHtml = await zimdump(`show --url "User:KiwixOffline/MWOffliner_Test" ${dump.outFile}`)
    const pageDoc = domino.createDocument(pageHtml)
    const scripts = Array.from(pageDoc.querySelectorAll('script'))

    const configScript = scripts.find((s) => s.textContent?.includes('window.MathJax'))
    expect(configScript).toBeTruthy()

    const entryScript = scripts.find((s) => s.getAttribute('src')?.includes('_mathjax_/es5/tex-chtml.js'))
    expect(entryScript).toBeTruthy()
  })

  test('MathJax scripts are absent when the page lead section has no MathJax modules (nodet)', async () => {
    // In nodet format the API is called with section=0, which returns only the lead
    // section modules. The test page has math only in its body, so ext.SimpleMathJax
    // is absent from data.parse.modules and MathJax must not be injected.
    const outFiles = await mwoffliner.execute({
      ...baseParameters,
      filenamePrefix: 'mathJax_nodet',
      format: ['nodet'],
    })
    const dump = outFiles[0]

    expect(dump.status.pages.success).toEqual(1)
    expect(dump.status.pages.hardFail).toEqual(0)
    expect(dump.status.pages.softFail).toEqual(0)

    await expect(zimcheck(dump.outFile)).resolves.not.toThrow()

    // MathJax runtime files are pushed to the ZIM unconditionally when mathJaxSource is set,
    // regardless of whether individual pages end up needing MathJax.
    const allFiles = (await zimdump(`list ${dump.outFile}`)).split('\n')
    const mathJaxFiles = allFiles.filter((f) => f.startsWith('_mathjax_/'))
    expect(mathJaxFiles).toContain('_mathjax_/es5/tex-chtml.js')

    // But the page itself must not have MathJax script tags: the lead section (section=0)
    // returned by the API for nodet format has no modules, so needsMathJax is false.
    const pageHtml = await zimdump(`show --url "User:KiwixOffline/MWOffliner_Test" ${dump.outFile}`)
    const pageDoc = domino.createDocument(pageHtml)
    const scripts = Array.from(pageDoc.querySelectorAll('script'))

    const mathJaxScript = scripts.find((s) => s.getAttribute('src')?.includes('_mathjax_') || s.textContent?.includes('window.MathJax'))
    expect(mathJaxScript).toBeUndefined()
  })
})
