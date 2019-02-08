import { leadSectionTemplate, sectionTemplate, subSectionTemplate } from '../Templates';
import { getStringsForLang } from '.';
import { Dump } from '../Dump';

export function renderDesktopArticle(json: any) {
    if (!json) { throw new Error(`Cannot render [${json}] into an article`); }
    if (json.visualeditor) {
        return json.visualeditor.content;
    } else if (json.contentmodel === 'wikitext' || (json.html && json.html.body)) {
        return json.html.body;
    } else if (json.parse && json.parse.text) {
        return json.parse.text['*'];
    } else if (json.error) {
        console.error(`Error retrieving article: ${json.error.info}`);
        return '';
    }
}

export function renderMCSArticle(json: any, dump: Dump, langIso2: string) {
    const strings = getStringsForLang(langIso2 || 'en', 'en');

    let html = '';
    // set the first section (open by default)
    html += leadSectionTemplate({
        lead_display_title: json.lead.displaytitle,
        lead_section_text: json.lead.sections[0].text,
        strings,
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
                    strings,
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
                    strings,
                });
            } else {
                const replacement = subSectionTemplate({
                    section_index: i + 1,
                    section_toclevel: oneSection.toclevel + 1,
                    section_id: oneSection.id,
                    section_anchor: oneSection.anchor,
                    section_line: oneSection.line,
                    section_text: oneSection.text,
                    strings,
                });
                html = html.replace(`__SUB_LEVEL_SECTION_${oneSection.id - 1}__`, replacement);
            }
        });
    }
    html = html.replace(`__SUB_LEVEL_SECTION_${json.remaining.sections.length}__`, ''); // remove the last subcestion anchor (all other anchor are removed in the forEach)
    return html;
}
