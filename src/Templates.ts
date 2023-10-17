import swig from 'swig-templates'
import pathParser from 'path'
import { config } from './config.js'
import { readFileSync } from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function readTemplate(t: string) {
  return readFileSync(pathParser.resolve(__dirname, '../res', t), 'utf-8')
}

/* Compile templates */
const footerTemplate = swig.compile(readTemplate(config.output.templates.footer))
const leadSectionTemplate = swig.compile(readTemplate(config.output.templates.lead_section_wrapper))
const sectionTemplate = swig.compile(readTemplate(config.output.templates.section_wrapper))
const subSectionTemplate = swig.compile(readTemplate(config.output.templates.subsection_wrapper))
const categoriesTemplate = swig.compile(readTemplate(config.output.templates.categories))
const subCategoriesTemplate = swig.compile(readTemplate(config.output.templates.subCategories))
const subPagesTemplate = swig.compile(readTemplate(config.output.templates.subPages))

const htmlWikimediaMobileTemplateCode = () => {
  return readTemplate(config.output.templates.pageWikimediaMobile)
}

const htmlWikimediaDesktopTemplateCode = () => {
  return readTemplate(config.output.templates.pageWikimediaDesktop)
}

const articleListHomeTemplate = readTemplate(config.output.templates.articleListHomeTemplate)

export {
  footerTemplate,
  leadSectionTemplate,
  sectionTemplate,
  subSectionTemplate,
  htmlWikimediaMobileTemplateCode,
  htmlWikimediaDesktopTemplateCode,
  articleListHomeTemplate,
  categoriesTemplate,
  subCategoriesTemplate,
  subPagesTemplate,
}
