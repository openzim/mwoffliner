// tslint:disable-next-line: no-reference
///<reference path="../../src/types.d.ts" />

import test from 'blue-tape';
import packageJSON from '../../package.json';

import execa from 'execa';

const mwo = `node lib/src/cli.js`;

test('Exec Command With Bash', async (t) => {
    const version = await execa.command(`${mwo} --version`);
    t.equal(version.stdout.trim(), packageJSON.version);

    const help = await execa.command(`${mwo} --help`);
    t.ok(help.stdout.trim().split('\n').length > 55);

    // TODO: Consider executing more e2e tests this way
});
