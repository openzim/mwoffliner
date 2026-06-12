import swig from 'swig-templates'
import pathParser from 'path'
import { config } from './config.js'
import { readFileSync } from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function readTemplate(t: string): string {
  return readFileSync(pathParser.resolve(__dirname, '../res', t), 'utf-8')
}

/* Compile templates */
const footerTemplate = swig.compile(readTemplate(config.output.templates.footer))
const downloadErrorPlaceholderTemplate = swig.compile(readTemplate(config.output.templates.downloadErrorPlaceholder))

const htmlVectorLegacyTemplateCode = () => {
  return readTemplate(config.output.templates.pageVectorLegacy)
}

const htmlVector2022TemplateCode = () => {
  return readTemplate(config.output.templates.pageVector2022)
}

const htmlFallbackTemplateCode = () => {
  return readTemplate(config.output.templates.pageFallback)
}

const htmlRedirectTemplateCode = () => {
  return readTemplate(config.output.templates.htmlRedirect)
}

const javaScriptTemplateCode = () => {
  return readTemplate(config.output.templates.javaScript)
}

const articleListHomeTemplate = readTemplate(config.output.templates.articleListHomeTemplate)

export {
  footerTemplate,
  htmlVectorLegacyTemplateCode,
  htmlVector2022TemplateCode,
  htmlFallbackTemplateCode,
  htmlRedirectTemplateCode,
  javaScriptTemplateCode,
  articleListHomeTemplate,
  downloadErrorPlaceholderTemplate,
}
