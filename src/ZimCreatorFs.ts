import { ZimCreator, ZimArticle } from 'libzim-binding';
import mkdirp from 'mkdirp';
import * as path from 'path';
import { rmdirSync, symlink } from 'fs';
import { writeFilePromise, mkdirPromise } from './util';

class ZimCreatorFs extends ZimCreator {
    public _createZimCreator({ fileName }: any) {
        try {
            rmdirSync(fileName);
        } catch (err) { /* NOOP */ }
        mkdirp.sync(fileName);
    }

    public async addArticle(this: any, article: ZimArticle) {
        const { dir } = path.parse(article.aid);
        await mkdirPromise(path.join(this.fileName, dir));

        const articleFileName = path.join(this.fileName, article.aid);

        if (article.redirectAid) {
            const target = article.redirectAid.split('/').slice(1).join('/'); // Hack
            return symlinkPromise(target, articleFileName);
        } else {
            return writeFilePromise(articleFileName, article.bufferData);
        }
    }

    public async finalise() {
        return Promise.resolve({});
    }
}

export {
    ZimCreatorFs,
};

function symlinkPromise(target: string, source: string) {
    return new Promise((resolve, reject) => {
        symlink(target, source, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}
