import { Dump } from '../Dump';

export function makeArticleListItem(dump: Dump, articleEntry: any) {
    return `<li><a href="${dump.getArticleBase('./' + articleEntry.title.replace(/ /g, '_'))}">${articleEntry.title.replace(/_/g, ' ')}<a></li>\n`;
}

export function makeArticleImageTile(dump: Dump, articleEntry: ArticleDetail) {
    return `<a class="item" href="${'./' + dump.getArticleBase(articleEntry.title.replace(/ /g, '_') || '')}"><figure><img src="${articleEntry.internalThumbnailUrl}" /><figcaption>${(articleEntry.title || '').replace(/_/g, ' ')}</figcaption></figure></a>\n`;
}
