import { Dump } from "../Dump";


export function makeArticleListItem(dump: Dump, articleEntry: any) {
    return `<li><a href="${dump.getArticleBase(articleEntry.title, true)}">${articleEntry.title.replace(/_/g, ' ')}<a></li>\n`;
}

export function makeArticleImageTile(dump: Dump, articleEntry: any) {
    return `<a class="item" href="${dump.getArticleBase(articleEntry.title || '', true)}"><figure><img src="${articleEntry.thumbnail}" /><figcaption>${(articleEntry.title || '').replace(/_/g, ' ')}</figcaption></figure></a>\n`;
}
