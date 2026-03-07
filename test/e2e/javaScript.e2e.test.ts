import * as mwoffliner from '../../src/mwoffliner.lib.js'
import { execa } from 'execa'
import { rimraf } from 'rimraf'
import { jest } from '@jest/globals'
import { zimdump, zimcheck } from '../util.js'

jest.setTimeout(200000)

describe('javaScript', () => {
  const now = new Date()
  const testId = `mwo-test-${+now}`

  const parameters = {
    mwUrl: 'https://en.wikipedia.org',
    adminEmail: 'test@kiwix.org',
    outputDirectory: testId,
    redis: process.env.REDIS,
    format: ['nopic'],
    articleList: 'France',
    mwActionApiPath: '/w/api.php',
  }

  afterAll(async () => {
    await execa('redis-cli flushall', { shell: true })
    rimraf.sync(`./${testId}`)
    const redisScan = await execa('redis-cli --scan', { shell: true })
    // Redis has been cleared
    expect(redisScan.stdout).toEqual('')
  })

  test('Scrape article from en.wikipedia.org without JavaScript', async () => {
    const javaScript = 'none'
    const filenamePrefix = `javaScript_${javaScript}`
    const outFiles = await mwoffliner.execute({ ...parameters, filenamePrefix, javaScript })
    const dump = outFiles[0]

    expect(dump.status.articles.success).toEqual(1)
    expect(dump.status.articles.hardFail).toEqual(0)
    expect(dump.status.articles.softFail).toEqual(0)

    await expect(zimcheck(dump.outFile)).resolves.not.toThrowError()

    const allFiles = await zimdump(`list ${dump.outFile}`)
    const allFilesArr = allFiles.split('\n')
    const jsFiles = allFilesArr.filter((elem) => elem.endsWith('.js') && elem.startsWith('_mw_/')).sort()

    expect(jsFiles).toHaveLength(0)
  })

  test('Scrape article from en.wikipedia.org with trusted JavaScript', async () => {
    const javaScript = 'trusted'
    const filenamePrefix = `javaScript_${javaScript}`
    const outFiles = await mwoffliner.execute({ ...parameters, filenamePrefix, javaScript })
    const dump = outFiles[0]

    expect(dump.status.articles.success).toEqual(1)
    expect(dump.status.articles.hardFail).toEqual(0)
    expect(dump.status.articles.softFail).toEqual(0)

    await expect(zimcheck(dump.outFile)).resolves.not.toThrowError()

    const allFiles = await zimdump(`list ${dump.outFile}`)
    const allFilesArr = allFiles.split('\n')
    const jsFiles = allFilesArr.filter((elem) => elem.endsWith('.js') && elem.startsWith('_mw_/')).sort()

    expect(jsFiles).toEqual(
      [
        '_mw_/ext.cite.ux-enhancements.js',
        '_mw_/ext.tmh.OgvJsSupport.js',
        '_mw_/ext.tmh.player.dialog.js',
        '_mw_/ext.tmh.player.inline.js',
        '_mw_/ext.tmh.player.js',
        '_mw_/ext.tmh.video-js.js',
        '_mw_/jquery.client.js',
        '_mw_/jquery.js',
        '_mw_/jquery.makeCollapsible.js',
        '_mw_/jquery.tablesorter.js',
        '_mw_/jquery.tablesorter.styles.js',
        '_mw_/mediawiki.String.js',
        '_mw_/mediawiki.Title.js',
        '_mw_/mediawiki.api.js',
        '_mw_/mediawiki.base.js',
        '_mw_/mediawiki.cldr.js',
        '_mw_/mediawiki.cookie.js',
        '_mw_/mediawiki.jqueryMsg.js',
        '_mw_/mediawiki.language.js',
        '_mw_/mediawiki.language.months.js',
        '_mw_/mediawiki.libs.pluralruleparser.js',
        '_mw_/mediawiki.page.ready.js',
        '_mw_/mediawiki.user.js',
        '_mw_/mediawiki.util.js',
        '_mw_/oojs-ui-core.icons.js',
        '_mw_/oojs-ui-core.js',
        '_mw_/oojs-ui-core.styles.js',
        '_mw_/oojs-ui-windows.icons.js',
        '_mw_/oojs-ui-windows.js',
        '_mw_/oojs-ui.styles.icons-content.js',
        '_mw_/oojs-ui.styles.icons-editing-advanced.js',
        '_mw_/oojs-ui.styles.indicators.js',
        '_mw_/oojs.js',
        '_mw_/startup.js',
        '_mw_/web2017-polyfills.js',
      ].sort(),
    )
  })

  test('Scrape article from en.wikipedia.org with trusted JavaScript and extra modules', async () => {
    const javaScript = 'trusted'
    const addModules = 'site,ext.gadget.ReferenceTooltips'
    const filenamePrefix = `javaScript_${javaScript}_addModules`
    const outFiles = await mwoffliner.execute({ ...parameters, filenamePrefix, javaScript, addModules })
    const dump = outFiles[0]

    expect(dump.status.articles.success).toEqual(1)
    expect(dump.status.articles.hardFail).toEqual(0)
    expect(dump.status.articles.softFail).toEqual(0)

    await expect(zimcheck(dump.outFile)).resolves.not.toThrowError()

    const allFiles = await zimdump(`list ${dump.outFile}`)
    const allFilesArr = allFiles.split('\n')
    const jsFiles = allFilesArr.filter((elem) => elem.endsWith('.js') && elem.startsWith('_mw_/')).sort()

    expect(jsFiles).toEqual(
      [
        '_mw_/ext.cite.ux-enhancements.js',
        '_mw_/ext.gadget.ReferenceTooltips.js',
        '_mw_/ext.tmh.OgvJsSupport.js',
        '_mw_/ext.tmh.player.dialog.js',
        '_mw_/ext.tmh.player.inline.js',
        '_mw_/ext.tmh.player.js',
        '_mw_/ext.tmh.video-js.js',
        '_mw_/jquery.client.js',
        '_mw_/jquery.js',
        '_mw_/jquery.makeCollapsible.js',
        '_mw_/jquery.tablesorter.js',
        '_mw_/jquery.tablesorter.styles.js',
        '_mw_/mediawiki.String.js',
        '_mw_/mediawiki.Title.js',
        '_mw_/mediawiki.api.js',
        '_mw_/mediawiki.base.js',
        '_mw_/mediawiki.cldr.js',
        '_mw_/mediawiki.cookie.js',
        '_mw_/mediawiki.jqueryMsg.js',
        '_mw_/mediawiki.language.js',
        '_mw_/mediawiki.language.months.js',
        '_mw_/mediawiki.libs.pluralruleparser.js',
        '_mw_/mediawiki.page.ready.js',
        '_mw_/mediawiki.user.js',
        '_mw_/mediawiki.util.js',
        '_mw_/oojs-ui-core.icons.js',
        '_mw_/oojs-ui-core.js',
        '_mw_/oojs-ui-core.styles.js',
        '_mw_/oojs-ui-windows.icons.js',
        '_mw_/oojs-ui-windows.js',
        '_mw_/oojs-ui.styles.icons-content.js',
        '_mw_/oojs-ui.styles.icons-editing-advanced.js',
        '_mw_/oojs-ui.styles.indicators.js',
        '_mw_/oojs.js',
        '_mw_/site.js',
        '_mw_/startup.js',
        '_mw_/web2017-polyfills.js',
      ].sort(),
    )
  })

  test('Scrape article from en.wikipedia.org with all JavaScript', async () => {
    const javaScript = 'all'
    const filenamePrefix = `javaScript_${javaScript}`
    const outFiles = await mwoffliner.execute({ ...parameters, filenamePrefix, javaScript })
    const dump = outFiles[0]

    expect(dump.status.articles.success).toEqual(1)
    expect(dump.status.articles.hardFail).toEqual(0)
    expect(dump.status.articles.softFail).toEqual(0)

    await expect(zimcheck(dump.outFile)).resolves.not.toThrowError()

    const allFiles = await zimdump(`list ${dump.outFile}`)
    const allFilesArr = allFiles.split('\n')
    const jsFiles = allFilesArr.filter((elem) => elem.endsWith('.js') && elem.startsWith('_mw_/')).sort()

    expect(jsFiles.length).toBeGreaterThan(45)
  })

  test('Scrape article from minecraft.wiki with trusted JavaScript and extra modules', async () => {
    const parameters = {
      mwUrl: 'https://minecraft.wiki',
      adminEmail: 'test@kiwix.org',
      outputDirectory: testId,
      redis: process.env.REDIS,
      format: ['nopic'],
      articleList: 'Zombie',
      mwActionApiPath: '/api.php',
    }
    const javaScript = 'trusted'
    const addModules = 'ext.gadget.randomMinceraft,ext.gadget.minceraft,ext.gadget.minceraft-logo'
    const filenamePrefix = `javaScript_${javaScript}_addModules_minecraft`
    const outFiles = await mwoffliner.execute({ ...parameters, filenamePrefix, javaScript, addModules })
    const dump = outFiles[0]

    expect(dump.status.articles.success).toEqual(1)
    expect(dump.status.articles.hardFail).toEqual(0)
    expect(dump.status.articles.softFail).toEqual(0)

    await expect(zimcheck(dump.outFile)).resolves.not.toThrowError()

    const allFiles = await zimdump(`list ${dump.outFile}`)
    const allFilesArr = allFiles.split('\n')
    const jsFiles = allFilesArr.filter((elem) => elem.endsWith('.js') && elem.startsWith('_mw_/')).sort()

    expect(jsFiles).toEqual(
      [
        '_mw_/ext.Tabber.js',
        '_mw_/ext.cite.ux-enhancements.js',
        '_mw_/ext.gadget.minceraft.js',
        '_mw_/ext.gadget.minceraft-logo.js',
        '_mw_/ext.gadget.randomMinceraft.js',
        '_mw_/jquery.client.js',
        '_mw_/jquery.js',
        '_mw_/jquery.makeCollapsible.js',
        '_mw_/jquery.makeCollapsible.styles.js',
        '_mw_/jquery.tablesorter.js',
        '_mw_/mediawiki.String.js',
        '_mw_/mediawiki.Title.js',
        '_mw_/mediawiki.Uri.js',
        '_mw_/mediawiki.api.js',
        '_mw_/mediawiki.base.js',
        '_mw_/mediawiki.cldr.js',
        '_mw_/mediawiki.cookie.js',
        '_mw_/mediawiki.jqueryMsg.js',
        '_mw_/mediawiki.language.js',
        '_mw_/mediawiki.language.months.js',
        '_mw_/mediawiki.libs.pluralruleparser.js',
        '_mw_/mediawiki.page.ready.js',
        '_mw_/mediawiki.user.js',
        '_mw_/mediawiki.util.js',
        '_mw_/startup.js',
        '_mw_/web2017-polyfills.js',
      ].sort(),
    )
  })
})
