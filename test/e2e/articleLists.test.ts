import test from 'blue-tape';
import { execute } from '../../src/mwoffliner.lib';
import execa from 'execa';
import rimraf from 'rimraf';
import { zimcheckAvailable, zimcheck } from 'test/util';
import 'dotenv/config';

const now = new Date();
const testId = `mwo-test-${+now}`;

const articleList = 'Kiwix,Wikipedia,Internet,Real-time computer graphics';
const articleListToIgnore = 'Wikipedia, Internet';
const listMinusIgnore = 2;
const parameters = {
    mwUrl: `https://en.wikipedia.org`,
    adminEmail: `test@kiwix.org`,
    articleList,
    articleListToIgnore,
    outputDirectory: testId,
    redis: process.env.REDIS,
    format: ['nopic'],
};

test('articleList and articleListIgnore check', async (t) => {
    await execa.command(`redis-cli flushall`);

    const outFiles = await execute(parameters);

    t.equal(outFiles.length, 1, `Created 1 output`);

    for (const dump of outFiles) {
        if (dump.nopic) {
            t.ok(dump.status.articles.success === listMinusIgnore, 'Output has right amount of articles');
            t.ok(dump.status.articles.fail === 0, 'Output has no failed article');
        }
    }

    t.ok(true, 'Scraped selected articles from wikipedia en');

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

    rimraf.sync(`./${testId}`);
    const redisScan = await execa.command(`redis-cli --scan`);
    t.equal(redisScan.stdout, '', 'Redis has been cleared');
})
