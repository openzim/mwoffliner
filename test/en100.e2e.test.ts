import test from 'blue-tape';
import { execute } from '../src/mwoffliner.lib';
import axios from 'axios';
import { leftPad } from './util';
import { ZimReader } from '@openzim/libzim';
// tslint:disable-next-line: no-var-requires
require('dotenv').config();

const now = new Date();

const testId = `mwo-test-${now.getMilliseconds()}`;

const articleListUrl = `https://download.kiwix.org/wp1/enwiki_${now.getUTCFullYear()}-${leftPad(now.getMonth(), 2)}/tops/10`;

const parameters = {
    mwUrl: `https://en.wikipedia.org`,
    adminEmail: `test@kiwix.org`,
    articleList: articleListUrl,
    outputDirectory: testId,
    redis: process.env.REDIS
};

test(async (t) => {
    const { data: articleIds } = await axios.get(articleListUrl);
    const [writtenZimFile] = await execute(parameters);

    const zimReader = new ZimReader(writtenZimFile);
    const numArticles = await zimReader.getCountArticles();
    console.log(numArticles);
});
