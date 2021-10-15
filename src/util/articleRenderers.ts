import domino from 'domino';
import {
    categoriesTemplate,
    leadSectionTemplate,
    sectionTemplate,
    subCategoriesTemplate,
    subPagesTemplate,
    subSectionTemplate
} from '../Templates';
import logger from '../Logger';
import type {Dump} from '../Dump';
import {articleDetailXId} from '../stores';
import {MWCapabilities} from '../Downloader';
import {getStrippedTitleFromHtml} from './misc';
import { DELETED_ARTICLE_ERROR } from './const';


export const renderArticle = async (json: any, articleId: string, dump: Dump, capabilities: MWCapabilities): Promise<RenderedArticle[]> => {
    const articleDetail = await articleDetailXId.get(articleId);
    const isMainPage = dump.isMainPage(articleId);

    if (isMainPage || (capabilities.veApiAvailable && !capabilities.desktopRestApiAvailable)) {
        const html = renderDesktopArticle(json, articleId, articleDetail, isMainPage);
        const strippedTitle = getStrippedTitleFromHtml(html);
        return [{
            articleId,
            displayTitle: strippedTitle || articleId.replace('_', ' '),
            html,
        }];
    }

    const result = [];
    let html = json;
    // Paginate when there are more than 200 subCategories
    const numberOfPagesToSplitInto = Math.max(Math.ceil((articleDetail.subCategories || []).length / 200), 1);
    for (let i = 0; i < numberOfPagesToSplitInto; i++) {
        const pageId = i === 0 ? '' : `__${i}`;
        const _articleId = articleId + pageId;
        const _articleDetail = Object.assign(
          {},
          articleDetail,
          {
              subCategories: (articleDetail.subCategories || []).slice(i * 200, (i + 1) * 200),
              nextArticleId: numberOfPagesToSplitInto > i + 1 ? `${articleId}__${i + 1}` : null,
              prevArticleId: (i - 1) > 0 ?
                `${articleId}__${i - 1}`
                : (i - 1) === 0
                  ? articleId
                  : null,
          },
        );

        if ((articleDetail.subCategories || []).length > 200) {
            await articleDetailXId.set(_articleId, _articleDetail);
        }

        // We don't really know the nature of 'json' variable because
        // of weak software architecture. Got there is correct json.
        if (json.lead) {
            html = renderMCSArticle(json, dump, _articleId, _articleDetail);
        }

        let strippedTitle = getStrippedTitleFromHtml(html);
        if (!strippedTitle) {
            const title = (json.lead || { displaytitle: articleId }).displaytitle;
            const doc = domino.createDocument(`<span class='mw-title'>${title}</span>`);
            strippedTitle = doc.getElementsByClassName('mw-title')[0].textContent;
        }

        result.push({
            articleId: _articleId,
            displayTitle: (strippedTitle || articleId.replace(/_/g, ' ')) + (i === 0 ? '' : `/${i}`),
            html,
        });
    }

    return result;
};


const injectHeader = (content: string, articleId: string, articleDetail: ArticleDetail): string => {
    const doc = domino.createDocument(content);
    const header = doc.createElement('h1');
    header.appendChild(doc.createTextNode(articleDetail.title));
    header.classList.add('article-header');
    const target = doc.querySelector('body.mw-body-content');
    target.insertAdjacentElement('afterbegin', header);
    return doc.documentElement.outerHTML;
};


export const renderDesktopArticle = (json: any, articleId: string, articleDetail: ArticleDetail, isMainPage: boolean = false): string => {
    if (!json) { throw new Error(`Cannot render [${json}] into an article`); }
    if (json.visualeditor) {
        // Testing if article has been deleted between fetching list and downloading content.
        if (json.visualeditor.oldid === 0) {
            logger.error(DELETED_ARTICLE_ERROR);
            throw new Error(DELETED_ARTICLE_ERROR);
        }
        return isMainPage ? json.visualeditor.content : injectHeader(json.visualeditor.content, articleId, articleDetail);
    } else if (json.contentmodel === 'wikitext' || (json.html && json.html.body)) {
        return json.html.body;
    } else if (json.error) {
        logger.error(`Error in retrieved article [${articleId}]:`, json.error);
        return '';
    }
    return json // This is HTML probably (the problem is that this is hard to know at this stage, buggy architecture)
};


const renderMCSArticle = (json: any, dump: Dump, articleId: string, articleDetail: ArticleDetail): string => {
    let html = '';

    // set the first section (open by default)
    html += leadSectionTemplate({
        lead_display_title: json.lead.displaytitle,
        lead_section_text: json.lead.sections[0].text,
        strings: dump.strings,
    });

    // set all other section (closed by default)
    if (!dump.nodet && json.remaining.sections.length > 0) {
        const stack = new Array(Number);
        json.remaining.sections
            .forEach((oneSection: any, i: number) => {
                if (i===0) {
                    // Always add first section and push it's toclevel on stack.
                    html += sectionTemplate({
                        section_index: oneSection.toclevel + 1,
                        section_id: oneSection.id,
                        section_anchor: oneSection.anchor,
                        section_line: oneSection.line,
                        section_text: oneSection.text,
                        strings: dump.strings,
                    });
                    stack.push(oneSection.toclevel);
                } else {
                    // If current toclevel is less than previous levels pop them and remove unused anchor.
                    while(stack.length > 0 && stack.slice(-1)[0] > oneSection.toclevel) {
                        html = html.replace(`__SUB_LEVEL_SECTION_${+stack.slice(-1)[0] + 1}__`, '');
                        html = html.replace(`__SAME_LEVEL_SECTION_${+stack.slice(-1)[0] + 1}__`, '');
                        stack.pop();
                    }
                    // If both section are on same level remove sub level section anchor and
                    // replace same level section anchor with template.
                    if (stack.slice(-1)[0] === oneSection.toclevel) {
                        html = html.replace(`__SUB_LEVEL_SECTION_${+stack.slice(-1)[0] + 1}__`, '');
                        html = html.replace(`__SAME_LEVEL_SECTION_${+stack.slice(-1)[0] + 1}__`,
                            sectionTemplate({
                                section_index: oneSection.toclevel + 1,
                                section_id: oneSection.id,
                                section_anchor: oneSection.anchor,
                                section_line: oneSection.line,
                                section_text: oneSection.text,
                                strings: dump.strings,
                            })
                        );
                    }
                    // Else section is inside previous level so replace sub level section anchor with template.
                    else {
                        html = html.replace(`__SUB_LEVEL_SECTION_${+stack.slice(-1)[0] + 1}__`,
                            sectionTemplate({
                                section_index: oneSection.toclevel + 1,
                                section_id: oneSection.id,
                                section_anchor: oneSection.anchor,
                                section_line: oneSection.line,
                                section_text: oneSection.text,
                                strings: dump.strings,
                            })
                        );
                        stack.push(oneSection.toclevel);
                    }
                }
            });
        // Remove all unused section anchors.
        while (stack.length > 0) {
            html = html.replace(`__SUB_LEVEL_SECTION_${+stack.slice(-1) + 1}__`, '');
            html = html.replace(`__SAME_LEVEL_SECTION_${+stack.slice(-1) + 1}__`, '');
            stack.pop();
        }
    }
    const articleResourceNamespace = 'A';
    const categoryResourceNamespace = 'U';
    const slashesInUrl = articleId.split('/').length - 1;
    const upStr = '../'.repeat(slashesInUrl + 1);
    if (articleDetail.subCategories && articleDetail.subCategories.length) {

        const subCategories = articleDetail.subCategories.map((category) => {
            return {
                name: category.title.split(':').slice(1).join(':'),
                url: `${upStr}${categoryResourceNamespace}/${category.title}`,
            };
        });

        const groups = groupAlphabetical(subCategories);

        html += subCategoriesTemplate({
            strings: dump.strings,
            groups,
            prevArticleUrl: articleDetail.prevArticleId ? `${upStr}${categoryResourceNamespace}/${articleDetail.prevArticleId}` : null,
            nextArticleUrl: articleDetail.nextArticleId ? `${upStr}${categoryResourceNamespace}/${articleDetail.nextArticleId}` : null,
        });
    }

    if (articleDetail.pages && articleDetail.pages.length) {
        const pages = articleDetail.pages.map((page) => {
            return {
                name: page.title,
                url: `${upStr}${articleResourceNamespace}/${page.title}`,
            };
        });

        const groups = groupAlphabetical(pages);

        html += subPagesTemplate({
            strings: dump.strings,
            groups,
        });
    }

    if (articleDetail.categories && articleDetail.categories.length) {
        const categories = articleDetail.categories.map((category) => {
            return {
                name: category.title.split(':').slice(1).join(':'),
                url: `${upStr}${categoryResourceNamespace}/${category.title}`,
            };
        });
        html += categoriesTemplate({
            strings: dump.strings,
            categories,
        });
    }
    html = html.replace(`__SUB_LEVEL_SECTION_${json.remaining.sections.length}__`, ''); // remove the last subcestion anchor (all other anchor are removed in the forEach)
    return html;
};


const groupAlphabetical = (items: PageRef[]) => {
    const groupsAlphabetical = items.reduce((acc: any, item) => {
        const groupId = item.name[0].toLocaleUpperCase();
        acc[groupId] = (acc[groupId] || []).concat(item);
        return acc;
    }, {});

    return Object.keys(groupsAlphabetical)
        .sort()
        .map((letter) => {
            return {
                title: letter,
                items: groupsAlphabetical[letter],
            };
        });
};
