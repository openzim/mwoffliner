import { ZimCreator, ZimArticle } from 'libzim-binding';
import * as mkdirp from 'mkdirp';
import * as path from 'path';
import { rmdirSync } from 'fs';
import { writeFilePromise } from './util';

class ZimCreatorFs extends ZimCreator {
    public _createZimCreator({ fileName }: any) {
        try {
            rmdirSync(fileName);
        } catch (err) { /* NOOP */ }
        mkdirp.sync(fileName);
    }

    public async addArticle(this: any, article: ZimArticle) {
        const { dir } = path.parse(article.aid);
        await mkdirp.mkdirp(path.join(this.fileName, dir));
        return writeFilePromise(path.join(this.fileName, article.aid), article.bufferData);
    }

    public async finalise() {
        return Promise.resolve({});
    }
}

export {
    ZimCreatorFs,
};
