import i18next from 'i18next'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as logger from './Logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function loadTranslation(lang: string): Record<string, string> {
  try {
    const fileContents = fs.readFileSync(path.join(__dirname, `../translation/${lang}.json`)).toString()
    const data = JSON.parse(fileContents)
    delete data['@metadata']
    return data
  } catch {
    logger.warn(`Couldn't find strings file for [${lang}]`)
    return {}
  }
}

export type Translator = (key: string, options?: Record<string, unknown>) => string

export async function createTranslator(lang: string, fallbackLang = 'en'): Promise<Translator> {
  // Merge fallback first then primary language (primary keys override fallback),
  // replicating the same strategy as the previous getStringsForLang helper.
  const merged: Record<string, string> = { ...loadTranslation(fallbackLang) }
  if (lang !== fallbackLang) {
    Object.assign(merged, loadTranslation(lang))
  }

  const instance = i18next.createInstance()
  await instance.init({
    lng: lang,
    resources: { [lang]: { translation: merged } },
    interpolation: { escapeValue: false },
  })

  return (key: string, options?: Record<string, unknown>) => instance.t(key, options)
}
