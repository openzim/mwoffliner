import * as mwoffliner from '../../src/mwoffliner.lib';
import { zimcheckAvailable, zimcheck } from '../util';
import rimraf from 'rimraf';
import execa = require('execa');
import 'dotenv/config';
import {jest} from '@jest/globals';

jest.setTimeout(120000);

describe('en10', () => {

  const now = new Date();
  const testId = `mwo-test-${+now}`;

  const articleListUrl = `https://download.openzim.org/wp1/enwiki/tops/10.tsv`;

  const parameters = {
    mwUrl: `https://en.wikipedia.org`,
    adminEmail: `test@kiwix.org`,
    articleList: articleListUrl,
    outputDirectory: testId,
    redis: process.env.REDIS,
    // format: ['nopic', 'novid', 'nopdf', 'nodet'],
    format: ['nopic', 'nopdf'],
  };

  test('Simple articleList', async () => {
    await execa.command(`redis-cli flushall`);

    const outFiles = await mwoffliner.execute(parameters);

    // Created 2 outputs
    expect(outFiles).toHaveLength(2);

    for (const dump of outFiles) {
      if (dump.nopic) {
        // nopic has enough files
        expect(dump.status.files.success).toBeGreaterThan(20);
        expect(dump.status.files.success).toBeLessThan(25);
        // nopic has enough redirects
        expect(dump.status.redirects.written).toBeGreaterThan(480);
        // nopic has 10 articles
        expect(dump.status.articles.success).toEqual(10);
      } else if (dump.novid) {
        // novid has enough files
        expect(dump.status.files.success).toBeGreaterThan(420);
        // novid has enough redirects
        expect(dump.status.redirects.written).toBeGreaterThan(480);
        // novid has 10 articles
        expect(dump.status.articles.success).toEqual(10);
      } else if (dump.nopdf) {
        // nopdf has enough files
        expect(dump.status.files.success).toBeGreaterThan(450);
        // nopdf has enough redirects
        expect(dump.status.redirects.written).toBeGreaterThan(480);
        // nopdf has 10 articles
        expect(dump.status.articles.success).toEqual(10);
      } else if (dump.nodet) {
        // nodet has enough files
        expect(dump.status.files.success).toBeGreaterThan(50);
        // nodet has enough redirects
        expect(dump.status.redirects.written).toBeGreaterThan(480);
        // nodet has 10 articles
        expect(dump.status.articles.success).toEqual(10);
      }

      if (await zimcheckAvailable()) {
        await expect(zimcheck(dump.outFile)).resolves.not.toThrowError();
      } else {
        console.log(`Zimcheck not installed, skipping test`);
      }
    }

    // TODO: fix node-libzim
    // const zimReader = new ZimReader(writtenZimFile);
    // const numArticles = await zimReader.getCountArticles();
    // console.log(numArticles)

    // Scraped EN top 10
    // TODO: clear test dir
    rimraf.sync(`./${testId}`);

    const redisScan = await execa.command(`redis-cli --scan`);
    // Redis has been cleared
    expect(redisScan.stdout).toEqual('');
  });
});
