import { ZimCreator, ZimArticle } from 'libzim-binding';
import * as mkdirp from 'mkdirp';
import { writeFilePromise } from './Utils';
import * as path from 'path';
import { rmdirSync } from 'fs';

class ZimCreatorFs extends ZimCreator {
    public _createZimCreator(fileName: string, welcome: string) {
        try {
            rmdirSync(fileName);
        } catch (err) { /* NOOP */}
        mkdirp.sync(fileName);
    }

    public async addArticle(article: ZimArticle) {
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
