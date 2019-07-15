// tslint:disable-next-line: no-reference
///<reference path="../../src/types.d.ts" />

import test from 'blue-tape';
import packageJSON from '../../package.json';

import { execPromise } from '../../src/util';

const mwo = `node lib/cli.js`;

test('Exec Command With Bash', async (t) => {
    const version = await execPromise(`${mwo} --version`);
    t.equal(version.trim(), packageJSON.version);

    const help = await execPromise(`${mwo} --help`);
    t.ok(help.trim().split('\n').length > 55);

    // TODO: Consider executing more e2e tests this way
});
