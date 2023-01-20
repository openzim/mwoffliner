// tslint:disable-next-line: no-reference
/// <reference path="../../src/types.d.ts" />

import packageJSON from '../../package.json'
import { execa } from 'execa'

const mwo = 'node lib/cli.js'

test('Exec Command With Bash', async () => {
  const version = await execa(`${mwo} --version`, { shell: true })
  expect(version.stdout.trim()).toEqual(packageJSON.version)

  const help = await execa(`${mwo} --help`, { shell: true })
  expect(help.stdout.trim().split('\n').length).toBeGreaterThan(55)

  // TODO: Consider executing more e2e tests this way
})
