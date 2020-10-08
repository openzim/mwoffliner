import test from 'blue-tape';
import { execute } from '../../src/mwoffliner.lib';
import execa from 'execa';
import rimraf from 'rimraf';
import { zimcheckAvailable, zimcheck } from 'test/util';
import 'dotenv/config';
import logger from '../../src/Logger';
// import { ZimReader } from '@openzim/libzim';

const now = new Date();
const testId = `mwo-test-${+now}`;

const parameters = {
    mwUrl: `https://fo.wikisource.org`,
    adminEmail: `test@kiwix.org`,
    outputDirectory: testId,
    redis: process.env.REDIS,
    format: ['nopic'],
    noLocalParserFallback: true
};

test('Wikisource List', async (t) => {
    await execa.command(`redis-cli flushall`);

    const outFiles = await execute(parameters);

    t.equal(outFiles.length, 1, `Created 1 output`);

    for (const dump of outFiles) {
        if (dump.nopic) {
            t.ok(dump.status.files.success >= 29, 'nopic has enough files');
            t.ok(dump.status.redirects.written >= 16 , 'nopic has enough redirects');
            t.ok(dump.status.articles.success >= 61, 'nopic has enough articles');
        }
    }

    t.ok(true, 'Scraped Wikisource Full');

    if (await zimcheckAvailable()) {
        try {
            await zimcheck(outFiles[0].outFile);
            t.ok(true, `Zimcheck passes`);
        } catch (err) {
            t.ok(false, `Zimcheck passes`);
        }
    } else {
        console.log(`Zimcheck not installed, skipping test`);
    }

    // TODO: clear test dir
    rimraf.sync(`./${testId}`);

    const redisScan = await execa.command(`redis-cli --scan`);
    t.equal(redisScan.stdout, '', 'Redis has been cleared');
});
