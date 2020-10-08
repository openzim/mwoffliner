// tslint:disable-next-line: no-reference
/// <reference path="../../src/types.d.ts" />

import 'dotenv/config';
import Redis from '../../src/Redis';
import test from 'blue-tape';
import { config } from '../../src/config';
import { articleDetailXId, redirectsXId, filesToDownloadXPath, populateArticleDetail, populateRedirects, populateFilesToDownload } from 'src/stores';

export const redis = new Redis({ redis: process.env.REDIS }, config);
populateArticleDetail(redis.client);
populateRedirects(redis.client);
populateFilesToDownload(redis.client);

articleDetailXId.flush();
redirectsXId.flush();
filesToDownloadXPath.flush();

test.onFinish(() => {
    console.info('Closing all redis connections');
    redis.client.quit();
});
