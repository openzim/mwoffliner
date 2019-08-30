import { ZimCreator, ZimArticle } from '@openzim/libzim';
import mkdirp from 'mkdirp';
import * as path from 'path';
import { symlink } from 'fs';
import { writeFilePromise, mkdirPromise } from './util';
import rimraf from 'rimraf';

class ZimCreatorFs extends ZimCreator {
    public _createZimCreator({ fileName }: any) {
        try {
            rimraf.sync(fileName);
        } catch (err) { /* NOOP */ }
        mkdirp.sync(fileName);
    }

    public async addArticle(this: any, article: ZimArticle) {
        const { dir } = path.parse(article.aid);
        await mkdirPromise(path.join(this.fileName, dir));

        const articleFileName = path.join(this.fileName, article.aid);

        if (article.redirectUrl) {
            const target = article.redirectUrl;
            try {
                const ret = await symlinkPromise(target, articleFileName);
                return ret;
            } catch (err) {
                return Promise.resolve({});
            }
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
