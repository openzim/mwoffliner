import { Dump } from '../Dump';
import { getArticleBase } from '../util';

export function makeArticleListItem(dump: Dump, articleEntry: any) {
    return `<li><a href="${getArticleBase('./' + articleEntry.title.replace(/ /g, '_'))}">${articleEntry.title.replace(/_/g, ' ')}<a></li>\n`;
}

export function makeArticleImageTile(dump: Dump, articleEntry: ArticleDetail) {
    return `<a class="item" href="${'./' + getArticleBase(articleEntry.title.replace(/ /g, '_') || '')}"><figure><img src="${articleEntry.internalThumbnailUrl}" /><figcaption>${(articleEntry.title || '').replace(/_/g, ' ')}</figcaption></figure></a>\n`;
}
