

export function makeArticleListItem(env, articleEntry) {
    return `<li><a href="${env.getArticleBase(articleEntry.title, true)}">${articleEntry.title.replace(/_/g, ' ')}<a></li>\n`;
}

export function makeArticleImageTile(env, articleEntry) {
    return `<a class="item" href="${env.getArticleBase(articleEntry.title, true)}"><figure><img src="${articleEntry.thumbnail}" /><figcaption>${articleEntry.title.replace(/_/g, ' ')}</figcaption></figure></a>\n`;
}
