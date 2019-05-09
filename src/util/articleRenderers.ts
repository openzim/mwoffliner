import { leadSectionTemplate, sectionTemplate, subSectionTemplate, categoriesTemplate, subCategoriesTemplate, subPagesTemplate } from '../Templates';
import { Dump } from '../Dump';
import logger from '../Logger';

export function renderDesktopArticle(json: any, articleId: string) {
    if (!json) { throw new Error(`Cannot render [${json}] into an article`); }
    if (json.visualeditor) {
        return json.visualeditor.content;
    } else if (json.contentmodel === 'wikitext' || (json.html && json.html.body)) {
        return json.html.body;
    } else if (json.parse && json.parse.text) {
        return json.parse.text['*'];
    } else if (json.error) {
        logger.error(`Error retrieving article: ${json.error.info}`);
        return '';
    }
}

export function renderMCSArticle(json: any, dump: Dump, articleId: string, articleDetail: ArticleDetail) {
    let html = '';
    // set the first section (open by default)
    html += leadSectionTemplate({
        lead_display_title: json.lead.displaytitle,
        lead_section_text: json.lead.sections[0].text,
        strings: dump.strings,
    });

    // set all other section (closed by default)
    if (!dump.nodet) {
        json.remaining.sections.forEach((oneSection: any, i: number) => {
            if (i === 0 && oneSection.toclevel !== 1) { // We need at least one Top Level Section
                html += sectionTemplate({
                    section_index: i,
                    section_id: i,
                    section_anchor: 'TopLevelSection',
                    section_line: 'Disambiguation',
                    section_text: '',
                    strings: dump.strings,
                });
            }

            // if below is to test if we need to nest a subsections into a section
            if (oneSection.toclevel === 1) {
                html = html.replace(`__SUB_LEVEL_SECTION_${oneSection.id - 1}__`, ''); // remove unused anchor for subsection
                html += sectionTemplate({
                    section_index: i + 1,
                    section_id: oneSection.id,
                    section_anchor: oneSection.anchor,
                    section_line: oneSection.line,
                    section_text: oneSection.text,
                    strings: dump.strings,
                });
            } else {
                const replacement = subSectionTemplate({
                    section_index: i + 1,
                    section_toclevel: oneSection.toclevel + 1,
                    section_id: oneSection.id,
                    section_anchor: oneSection.anchor,
                    section_line: oneSection.line,
                    section_text: oneSection.text,
                    strings: dump.strings,
                });
                html = html.replace(`__SUB_LEVEL_SECTION_${oneSection.id - 1}__`, replacement);
            }
        });
    }
    const resourceNamespace = 'A';
    const slashesInUrl = articleId.split('/').length - 1;
    const upStr = '../'.repeat(slashesInUrl + 1);
    if (articleDetail.subCategories && articleDetail.subCategories.length) {

        const subCategories = articleDetail.subCategories.map((category) => {
            return {
                name: category.title.split(':').slice(1).join(':'),
                url: `${upStr}${resourceNamespace}/${category.title.replace(/ /g, '_')}${dump.nozim ? '.html' : ''}`,
            };
        });

        const groups = groupAlphabetical(subCategories);

        html += subCategoriesTemplate({
            strings: dump.strings,
            groups,
        });
    }

    if (articleDetail.pages && articleDetail.pages.length) {
        const pages = articleDetail.pages.map((page) => {
            return {
                name: page.title,
                url: `${upStr}${resourceNamespace}/${page.title.replace(/ /g, '_')}${dump.nozim ? '.html' : ''}`,
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
                url: `${upStr}${resourceNamespace}/${category.title.replace(/ /g, '_')}${dump.nozim ? '.html' : ''}`,
            };
        });
        html += categoriesTemplate({
            strings: dump.strings,
            categories,
        });
    }
    html = html.replace(`__SUB_LEVEL_SECTION_${json.remaining.sections.length}__`, ''); // remove the last subcestion anchor (all other anchor are removed in the forEach)
    return html;
}

function groupAlphabetical(items: Array<{ name: string, url: string }>) {
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
}
