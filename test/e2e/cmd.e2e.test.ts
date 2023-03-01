// tslint:disable-next-line: no-reference
/// <reference path="../../src/types.d.ts" />

import packageJSON from '../../package.json'
import { execa } from 'execa'

const mwo = 'node lib/cli.js'

describe('Exec Command With Bash', () => {
  test('Exec Command With --version option', async () => {
    const version = await execa(`${mwo} --version`, { shell: true })
    expect(version.stdout.trim()).toEqual(packageJSON.version)
  })

  test('Exec Command With --help option', async () => {
    const help = await execa(`${mwo} --help`, { shell: true })
    expect(help.stdout.trim().split('\n').length).toBeGreaterThan(55)
  })

  describe('Sanitizing', () => {
    test('Exec Command With --articlesList and --addNamespaces together', async () => {
      await expect(execa(`${mwo} --adminEmail=test@test.test --articleList=Portal:Biology --mwUrl=https://en.wikipedia.org/ --addNamespaces=100`, { shell: true })).rejects.toThrow(
        /options --articlesList and --addNamespaces cannot be used together/,
      )
    })

    test('Exec Command With --verbose option', async () => {
      await expect(execa(`${mwo} --verbose=anyString --mwUrl="https://en.wikipedia.org" --adminEmail="test@test.test"`, { shell: true })).rejects.toThrow(
        /verbose should be empty or one of \[info, log, warn, error, quiet\]/,
      )
    })
  })
})
