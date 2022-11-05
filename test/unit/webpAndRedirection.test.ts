import execa from 'execa';
import { join } from 'path';
import test from 'blue-tape';
import { execute } from '../../src/mwoffliner.lib';
import { writeFilePromise, mkdirPromise } from '../../src/util';
import { Archive } from '@openzim/libzim'
import FileType from 'file-type'
import { isWebpCandidateImageUrl } from '../../src/util/misc';
import rimraf from 'rimraf';

const now = new Date();
const testId = join(process.cwd(), `mwo-test-${+now}`);

const articleListUrl = join(testId, '/articleList');

test('Webp Option check', async (t) => {
    await execa.command(`redis-cli flushall`);
    await mkdirPromise(testId);

    const articleList = `
Animation
Real-time computer graphics`;

    await writeFilePromise(articleListUrl, articleList, 'utf8');

    const outFiles = await execute({
        mwUrl: `https://en.wikipedia.org`,
        adminEmail: `test@kiwix.org`,
        articleList: articleListUrl,
        outputDirectory: testId,
        redis: process.env.REDIS,
        webp: true,
    });
    const zimFile = new Archive(outFiles[0].outFile);

    t.assert(isWebpCandidateImageUrl('../I/osm-intl%2C9%2C52.2789%2C8.0431%2C300x300.png?lang.svg'),
        'detecting webp URL having png before arguments');
    t.assert(isWebpCandidateImageUrl('../I/osm-intl%2C9%2C52.2789%2C8.0431%2C300x300.jpg?lang.svg'),
        'detecting webp URL having jpg before arguments');
    t.assert(isWebpCandidateImageUrl('../I/osm-intl%2C9%2C52.2789%2C8.0431%2C300x300.jpeg?lang.svg'),
        'detecting webp URL having jpeg before arguments');
    t.assert(!isWebpCandidateImageUrl('../I/osm-intl%2C9%2C52.2789%2C8.0431%2C300x300.jpeg%3Flang.svg'),
        'avoiding detecting webp URL having an escaped question marked');
    t.assert(isWebpCandidateImageUrl('../I/osm-intl%2C9%2C52.2789%2C8.0431%2C300x300.png'),
        'detecting webp URL having png at last');
    t.assert(isWebpCandidateImageUrl('../I/osm-intl%2C9%2C52.2789%2C8.0431%2C300x300.jpg'),
        'detecting webp URL having jpg at last');
    t.assert(isWebpCandidateImageUrl('../I/osm-intl%2C9%2C52.2789%2C8.0431%2C300x300.jpeg'),
        'detecting webp URL having jpeg at last');
    t.assert(await isWebpPresent('Animexample3edit.png.webp', zimFile), 'passed test for png')
    t.assert(await isWebpPresent('Claychick.jpg.webp', zimFile), 'passed test for jpg')
    t.assert(await isRedirectionPresent('href="Real-time_rendering"',
        zimFile), 'redirection check successful')
    rimraf.sync(testId);
})

async function isWebpPresent(path: string, zimFile: Archive) {
  try {
    const result = await zimFile.getEntryByPath(path);
    return (await FileType.fromBuffer(result.data)).mime === 'image/webp';
  } catch(err) {
    return false;
  }
}

async function isRedirectionPresent(path: string, zimFile: ZimReader) {
    return await zimFile.getArticleByUrl('Animation')
    .then((result) => {
        return result.data.toString().includes(path);
    })
}
