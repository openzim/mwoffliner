import test from 'blue-tape';
import { execute } from '../../src/mwoffliner.lib';
import { zimcheckAvailable, zimcheck } from '../util';
import rimraf from 'rimraf';
import { writeFilePromise, mkdirPromise } from '../../src/util';
import { join } from 'path';
import execa = require('execa');
import 'dotenv/config';
// import { ZimReader } from '@openzim/libzim';

const now = new Date();
const testId = join(process.cwd(), `mwo-test-${+now}`);

const articleListUrl = join(testId, '/articleList');

test('Local Parsoid', async (t) => {
    await execa.command(`redis-cli flushall`);
    await mkdirPromise(testId);

    const articleListLines = `
    Damage_Formula
    Agni
    Hades`;

    await writeFilePromise(articleListUrl, articleListLines, 'utf8');

    const outFiles = await execute({
        mwUrl: `https://gbf.wiki`,
        adminEmail: `test@kiwix.org`,
        outputDirectory: testId,
        redis: process.env.REDIS,
        mwApiPath: 'api.php',
        mwModulePath: 'load.php',
        mwWikiPath: 'index.php',
        articleList: articleListUrl
    });

    t.equal(outFiles.length, 1, `Created 1 output`);

    for (const dump of outFiles) {
        t.equal(dump.status.articles.success, 3, '3 articles scraped');

        if (await zimcheckAvailable()) {
            try {
                await zimcheck(dump.outFile);
                t.ok(true, `Zimcheck passes`);
            } catch (err) {
                t.ok(false, `Zimcheck passes`);
            }
        } else {
            console.log(`Zimcheck not installed, skipping test`);
        }

        t.ok(dump.status.files.success >= 45, 'has enough files');
        t.ok(dump.status.redirects.written >= 0, 'has enough redirects');
        t.ok(dump.status.articles.success >= 3, 'has enough articles');
    }

    t.ok(true, 'Scraped gbf wiki articles');
    // TODO: clear test dir
    rimraf.sync(testId);

    const redisScan = await execa.command(`redis-cli --scan`);
    t.equal(redisScan.stdout, '', 'Redis has been cleared');
});
