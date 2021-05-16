import test from 'blue-tape';
import { execute } from '../../src/mwoffliner.lib';
import { zimcheckAvailable, zimcheck } from '../util';
import rimraf from 'rimraf';
import { writeFilePromise, mkdirPromise } from '../../src/util';
import { join } from 'path';
import execa = require('execa');
import 'dotenv/config';
import fs from 'fs';
import logger from '../../src/Logger';

const now = new Date();
const testId = join(process.cwd(), `mwo-test-${+now}`);

const articleListUrl = join(testId, '/articleList');

test('Local Parsoid', async (t) => {
    await execa.command(`redis-cli flushall`);
    await mkdirPromise(testId);

    const articleListLines = `
    Arch Linux
    Acer Aspire One
    D-Bus`;

    await writeFilePromise(articleListUrl, articleListLines, 'utf8');

    const outFiles = await execute({
        mwUrl: `https://wiki.archlinux.org`,
        adminEmail: `test@kiwix.org`,
        outputDirectory: testId,
        redis: process.env.REDIS,
        mwApiPath: 'api.php',
        mwModulePath: 'load.php',
        mwWikiPath: 'index.php',
        articleList: articleListUrl,
        customZimFavicon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Archlinux-icon-crystal-64.svg/65px-Archlinux-icon-crystal-64.svg.png'
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

        t.ok(dump.status.files.success >= 31, 'has enough files');
        t.ok(dump.status.redirects.written >= 14, 'has enough redirects');
        t.ok(dump.status.articles.success >= 3, 'has enough articles');
    }

    // Check ZIM file size
    t.ok(fs.statSync(outFiles[0].outFile).size > 285839, 'ZIM file size');

    t.ok(true, 'Scraped  archlinux_wiki articles');
    // TODO: clear test dir
    rimraf.sync(testId);

    const redisScan = await execa.command(`redis-cli --scan`);
    t.equal(redisScan.stdout, '', 'Redis has been cleared');
});
