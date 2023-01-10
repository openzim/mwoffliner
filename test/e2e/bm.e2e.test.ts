import * as mwoffliner  from '../../src/mwoffliner.lib';
import execa from 'execa';
import rimraf from 'rimraf';
import { zimcheckAvailable, zimcheck } from '../util';
import 'dotenv/config';
import {jest} from '@jest/globals';

jest.setTimeout(120000);

describe('bm', () => {
  const now = new Date();
  const testId = `mwo-test-${+now}`;

  const parameters = {
    mwUrl: `https://bm.wikipedia.org`,
    adminEmail: `test@kiwix.org`,
    outputDirectory: testId,
    redis: process.env.REDIS,
    format: ['nopic'],
  };

  test('Simple articleList', async () => {
    await execa.command(`redis-cli flushall`);

    const outFiles = await mwoffliner.execute(parameters);

    // Created 1 output
    expect(outFiles).toHaveLength(1);

    for (const dump of outFiles) {
      if (dump.nopic) {
        // nopic has enough files
        expect(dump.status.files.success).toBeGreaterThan(16);
        // nopic has enough redirects
        expect(dump.status.redirects.written).toBeGreaterThan(170);
        // nopic has enough articles
        expect(dump.status.articles.success).toBeGreaterThan(700);
      }
    }

    if (await zimcheckAvailable()) {
      await expect(zimcheck(outFiles[0].outFile)).resolves.not.toThrowError();
    } else {
      console.log(`Zimcheck not installed, skipping test`);
    }

    // TODO: clear test dir
    rimraf.sync(`./${testId}`);

    const redisScan = await execa.command(`redis-cli --scan`);
    // Redis has been cleared
    expect(redisScan.stdout).toEqual('');
  });
});
