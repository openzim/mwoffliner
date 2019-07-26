import test from 'blue-tape';
import { execute } from '../../src/mwoffliner.lib';
import { zimcheckAvailable, zimcheck } from '../util';
import rimraf from 'rimraf';
import { execPromise } from '../../src/util';
// import { ZimReader } from '@openzim/libzim';
// tslint:disable-next-line: no-var-requires
require('dotenv').config();

const now = new Date();
const testId = `mwo-test-${+now}`;

const articleListUrl = `https://download.kiwix.org/wp1/enwiki/tops/10`;

const parameters = {
    mwUrl: `https://en.wikipedia.org`,
    adminEmail: `test@kiwix.org`,
    articleList: articleListUrl,
    outputDirectory: testId,
    redis: process.env.REDIS,
    useCache: true,
    format: ['nopic', 'novid', 'nozim', 'nopdf', 'nodet'],
};

test('Simple articleList', async (t) => {
    await execPromise(`redis-cli flushall`);

    // const { data: articleIds } = await axios.get(articleListUrl);
    const outFiles = await execute(parameters);

    t.equal(outFiles.length, 5, `Created 5 outputs`);

    for (const dump of outFiles) {
        if (dump.nopic) {
            t.ok(dump.status.files.success > 35, 'nopic has enough files');
            t.ok(dump.status.redirects.written > 300, 'nopic has enough redirects');
            t.ok(dump.status.articles.success === 10, 'nopic has 10 articles');
        } else if (dump.novid) {
            t.ok(dump.status.files.success > 420, 'novid has enough files');
            t.ok(dump.status.redirects.written > 300, 'novid has enough redirects');
            t.ok(dump.status.articles.success === 10, 'novid has 10 articles');
        } else if (dump.nozim) {
            t.ok(dump.status.files.success > 450, 'nozim has enough files');
            t.ok(dump.status.redirects.written > 300, 'nozim has enough redirects');
            t.ok(dump.status.articles.success === 10, 'nozim has 10 articles');
        } else if (dump.nopdf) {
            t.ok(dump.status.files.success > 450, 'nopdf has enough files');
            t.ok(dump.status.redirects.written > 300, 'nopdf has enough redirects');
            t.ok(dump.status.articles.success === 10, 'nopdf has 10 articles');
        } else if (dump.nodet) {
            t.ok(dump.status.files.success > 50, 'nodet has enough files');
            t.ok(dump.status.redirects.written > 300, 'nodet has enough redirects');
            t.ok(dump.status.articles.success === 10, 'nodet has 10 articles');
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

    // TODO: fix node-libzim
    // const zimReader = new ZimReader(writtenZimFile);
    // const numArticles = await zimReader.getCountArticles();
    // console.log(numArticles)

    t.ok(true, 'Scraped EN top 10');
    // TODO: clear test dir
    rimraf.sync(`./${testId}`);

    const redisScan = await execPromise(`redis-cli --scan`);
    t.equal(redisScan, '', 'Redis has been cleared');
});
