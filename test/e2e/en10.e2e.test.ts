import test from 'blue-tape';
import { execute } from '../../src/mwoffliner.lib';
import { leftPad } from '../util';
import rimraf from 'rimraf';
import { execPromise } from '../../src/util';
// import { ZimReader } from '@openzim/libzim';
// tslint:disable-next-line: no-var-requires
require('dotenv').config();

const now = new Date();
const testId = `mwo-test-${+now}`;

const articleListUrl = `https://download.kiwix.org/wp1/enwiki_${now.getUTCFullYear()}-${leftPad(now.getMonth(), 2)}/tops/10`;

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

    // TODO: fix node-libzim
    // const zimReader = new ZimReader(writtenZimFile);
    // const numArticles = await zimReader.getCountArticles();
    // console.log(numArticles);

    t.ok(true, 'Scraped EN top 10');
    // TODO: clear test dir
    rimraf.sync(`./${testId}`);

    const redisScan = await execPromise(`redis-cli --scan`);
    t.equal(redisScan, '', 'Redis has been cleared');
});
