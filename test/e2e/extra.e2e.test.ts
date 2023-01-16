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

test('Simple customMainPage', async (t) => {
    await execa.command(`redis-cli flushall`);
    await mkdirPromise(testId);

    const articleListLines = `
1%_(South_Park)
İznik
Egyptian_hieroglyphs
Wikipedia:Books/archive/Cancer care
Wikipedia:Books/archive/Ears nose throat
Wikipedia:Books/archive/Eye diseases`;

    await writeFilePromise(articleListUrl, articleListLines, 'utf8');

    const outFiles = await execute({
        mwUrl: `https://en.wikipedia.org`,
        adminEmail: `test@kiwix.org`,
        articleList: articleListUrl,
        customMainPage: 'Wikipedia:WikiProject_Medicine/Open_Textbook_of_Medicine2',
        outputDirectory: testId,
        redis: process.env.REDIS,
        format: ['nopic'],
    });

    t.equal(outFiles.length, 1, `Created 1 outputs`);

    for (const dump of outFiles) {
        if (dump.nopic) {
            const articleCount = articleListLines.split(/\r\n|\r|\n/).length;
            t.equal(dump.status.articles.success, articleCount, 'nopic has ' + articleCount + ' articles');
        }

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
    }

    t.ok(true, 'Scraped customMainPage');
    // TODO: clear test dir
    rimraf.sync(testId);

    const redisScan = await execa.command(`redis-cli --scan`);
    t.equal(redisScan.stdout, '', 'Redis has been cleared');
});
