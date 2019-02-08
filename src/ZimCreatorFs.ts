import { ZimCreator, ZimArticle } from 'libzim-binding';
import mkdirp from 'mkdirp';
import * as path from 'path';
import { rmdirSync } from 'fs';
import { writeFilePromise, mkdirPromise } from './util';

class ZimCreatorFs extends ZimCreator {
    public _createZimCreator({ fileName }: any) {
        try {
            rmdirSync(fileName);
        } catch (err) { /* NOOP */ }
        mkdirp.sync(fileName);
    }

    public async addArticle(this: any, article: ZimArticle) {

        // TODO: implement redirect articles

        const { dir } = path.parse(article.aid);
        await mkdirPromise(path.join(this.fileName, dir));
        return writeFilePromise(path.join(this.fileName, article.aid), article.bufferData);
    }

    public async finalise() {
        return Promise.resolve({});
    }
}

export {
    ZimCreatorFs,
};
