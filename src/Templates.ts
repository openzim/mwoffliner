import swig from 'swig-templates';
import pathParser from 'path';
import { config } from './config';
import { readFileSync } from 'fs';
import { genHeaderCSSLink, genHeaderScript } from './util';

function readTemplate(t: string) {
    return readFileSync(pathParser.resolve(__dirname, '../res', t), 'utf-8');
}

const cssLinks = config.output.cssResources.reduce((buf, css) => {
    return buf + genHeaderCSSLink(config, css);
}, '');

const jsScripts = config.output.jsResources.reduce((buf, js) => {
    return buf + genHeaderScript(config, js);
}, '');

/* Compile templates */
const footerTemplate = swig.compile(readTemplate(config.output.templates.footer));
const leadSectionTemplate = swig.compile(readTemplate(config.output.templates.lead_section_wrapper));
const sectionTemplate = swig.compile(readTemplate(config.output.templates.section_wrapper));
const subSectionTemplate = swig.compile(readTemplate(config.output.templates.subsection_wrapper));

const htmlTemplateCode = readTemplate(config.output.templates.page)
    .replace('__CSS_LINKS__', cssLinks)
    .replace('__JS_SCRIPTS__', jsScripts);
const articleListHomeTemplate = readTemplate(config.output.templates.articleListHomeTemplate);

export {
    footerTemplate,
    leadSectionTemplate,
    sectionTemplate,
    subSectionTemplate,
    htmlTemplateCode,
    articleListHomeTemplate,
};
