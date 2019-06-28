import test from 'blue-tape';
import { execute } from '../../src/mwoffliner.lib';

import rimraf from 'rimraf';
import { execPromise } from '../../src/util';
// import { ZimReader } from '@openzim/libzim';
// tslint:disable-next-line: no-var-requires
require('dotenv').config();

const now = new Date();
const testId = `mwo-test-${+now}`;

const parameters = {
    mwUrl: `https://bm.wikipedia.org`,
    adminEmail: `test@kiwix.org`,
    outputDirectory: testId,
    redis: process.env.REDIS,
    format: ['nopic'],
};

test('Simple articleList', async (t) => {
    await execPromise(`redis-cli flushall`);

    const outFiles = await execute(parameters);

    t.equal(outFiles.length, 1, `Created 1 output`);

    for (const dump of outFiles) {
        if (dump.nopic) {
            t.ok(dump.status.files.success > 25, 'nopic has enough files');
            t.ok(dump.status.redirects.written > 170, 'nopic has enough redirects');
            t.ok(dump.status.articles.success > 700, 'nopic has enough articles');
        }
    }

    t.ok(true, 'Scraped BM Full');
    // TODO: clear test dir
    rimraf.sync(`./${testId}`);

    const redisScan = await execPromise(`redis-cli --scan`);
    t.equal(redisScan, '', 'Redis has been cleared');
});
