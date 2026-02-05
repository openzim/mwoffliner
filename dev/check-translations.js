#!/usr/bin/env node
/**
 * Validate i18n translation files and usage in code.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configuration
const CONFIG = {
  ROOT: path.resolve(__dirname, '..'),
  TRANSLATION_DIR: path.resolve(__dirname, '../translation'),
  SRC_DIR: path.resolve(__dirname, '../src'),
  SOURCE_LANG: 'en.json',
  DOC_LANG: 'qqq.json',
  IGNORE_KEYS: ['@metadata', 'language'],
  DYNAMIC_KEYS_PREFIXES: ['DOWNLOAD_ERRORS_LINE1_'],
}

// Colors for Output
const C = {
  Reset: '\x1b[0m',
  Red: '\x1b[31m',
  Green: '\x1b[32m',
  Yellow: '\x1b[33m',
  Blue: '\x1b[34m',
  Bold: '\x1b[1m',
}

let exitCode = 0

function error(msg) {
  console.error(msg)
  exitCode = 1
}

function printHeader(title) {
  console.log(`\n${C.Bold}${C.Blue}=== ${title} ===${C.Reset}`)
}

function loadJson(filepath) {
  if (!fs.existsSync(filepath)) return null
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'))
  } catch (e) {
    error(`Failed to parse JSON: ${filepath}\n${e.message}`)
    return null // Return null on error
  }
}

// Flatten keys: { "a": { "b": 1 } } -> [ "a.b" ]
function getAllKeys(obj, prefix = '') {
  let keys = new Set()
  for (const [key, value] of Object.entries(obj)) {
    if (CONFIG.IGNORE_KEYS.includes(key)) continue

    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const childKeys = getAllKeys(value, fullKey)
      childKeys.forEach((k) => keys.add(k))
    } else {
      keys.add(fullKey)
    }
  }
  return keys
}

// Find all .ts files in src
function walkDir(dir, ext) {
  let results = []
  const list = fs.readdirSync(dir)
  list.forEach((file) => {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(filePath, ext))
    } else {
      if (filePath.endsWith(ext)) {
        results.push(filePath)
      }
    }
  })
  return results
}

function extractKeysFromCode(dir) {
  const files = walkDir(dir, '.ts')
  const usedKeys = new Set()
  const keyLocations = {} // key -> [files]
  const foundPrefixes = new Set()

  const patterns = [/\.strings\.([a-zA-Z0-9_]+)/g, /\.strings\['([a-zA-Z0-9_]+)'\]/g, /\.strings\["([a-zA-Z0-9_]+)"\]/g]

  files.forEach((file) => {
    const content = fs.readFileSync(file, 'utf8')
    const relativePath = path.relative(CONFIG.ROOT, file)

    // Check for dynamic key prefixes with context
    CONFIG.DYNAMIC_KEYS_PREFIXES.forEach((prefix) => {
      if (foundPrefixes.has(prefix)) return

      // Escape prefix for regex
      const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

      // Look for: .strings.PREFIX or .strings['PREFIX or .strings["PREFIX or .strings[`PREFIX
      const regex = new RegExp(`\\.strings(?:\\.|\\['|\\["|\\[\`)${escapedPrefix}`)

      if (regex.test(content)) {
        foundPrefixes.add(prefix)
      }
    })

    patterns.forEach((regex) => {
      let match
      while ((match = regex.exec(content)) !== null) {
        const key = match[1]
        usedKeys.add(key)
        if (!keyLocations[key]) keyLocations[key] = []
        if (!keyLocations[key].includes(relativePath)) {
          keyLocations[key].push(relativePath)
        }
      }
    })
  })

  return { usedKeys, keyLocations, foundPrefixes }
}

function main() {
  printHeader('1. Checking Environment')

  if (!fs.existsSync(CONFIG.TRANSLATION_DIR)) {
    console.error(`${C.Red}[FAIL] Translation directory missing: ${CONFIG.TRANSLATION_DIR}${C.Reset}`)
    process.exit(1)
  } else {
    console.log(`${C.Green}[PASS] Found translation directory${C.Reset}`)
  }

  // Load Source Lang
  printHeader('2. Validating Locale Files')
  const sourceFile = path.join(CONFIG.TRANSLATION_DIR, CONFIG.SOURCE_LANG)
  const sourceData = loadJson(sourceFile)
  if (!sourceData) {
    console.error(`${C.Red}[FAIL] FATAL: Could not load source language ${CONFIG.SOURCE_LANG}${C.Reset}`)
    process.exit(1)
  }

  const sourceKeys = getAllKeys(sourceData)
  console.log(`Loaded ${C.Bold}${sourceKeys.size}${C.Reset} keys from ${CONFIG.SOURCE_LANG}`)

  // Load QQQ
  const qqqFile = path.join(CONFIG.TRANSLATION_DIR, CONFIG.DOC_LANG)
  const qqqData = loadJson(qqqFile)

  if (qqqData) {
    const qqqKeys = getAllKeys(qqqData)

    const missingDoc = [...sourceKeys].filter((k) => !qqqKeys.has(k))
    const extraDoc = [...qqqKeys].filter((k) => !sourceKeys.has(k))

    if (missingDoc.length > 0) {
      error(`${C.Red}[FAIL] Missing documentation in ${CONFIG.DOC_LANG}: ${missingDoc.length} keys${C.Reset}`)
      missingDoc.sort().forEach((k) => console.log(`   - ${k}`))
    }
    if (extraDoc.length > 0) {
      error(`${C.Red}[FAIL] Extra keys in ${CONFIG.DOC_LANG} (not in source): ${extraDoc.length} keys${C.Reset}`)
      extraDoc.sort().forEach((k) => console.log(`   - ${k}`))
    }
    if (missingDoc.length === 0 && extraDoc.length === 0) {
      console.log(`${C.Green}[PASS] ${CONFIG.DOC_LANG} matches ${CONFIG.SOURCE_LANG} keys${C.Reset}`)
    }
  } else {
    error(`Missing ${CONFIG.DOC_LANG}`)
  }

  // Check Other Locales
  const files = fs.readdirSync(CONFIG.TRANSLATION_DIR).filter((f) => f.endsWith('.json') && f !== CONFIG.SOURCE_LANG && f !== CONFIG.DOC_LANG)
  console.log(`Checking ${files.length} other language files...`)

  files.forEach((f) => {
    const data = loadJson(path.join(CONFIG.TRANSLATION_DIR, f))
    if (!data) return

    const keys = getAllKeys(data)
    const unknownKeys = [...keys].filter((k) => !sourceKeys.has(k))

    if (unknownKeys.length > 0) {
      error(`${C.Red}[FAIL] ${f}: Contains ${unknownKeys.length} keys not in ${CONFIG.SOURCE_LANG}${C.Reset}`)
      unknownKeys.sort().forEach((k) => console.log(`   - ${k}`))
    }
  })

  // Code Usage Check
  printHeader('3. Checking Code Usage')
  const { usedKeys, keyLocations, foundPrefixes } = extractKeysFromCode(CONFIG.SRC_DIR)
  console.log(`Found ${C.Bold}${usedKeys.size}${C.Reset} unique translation keys in source code.`)

  // Check 1: Keys in Code but missing in Source
  const missingInSource = [...usedKeys].filter((k) => !sourceKeys.has(k))
  if (missingInSource.length > 0) {
    const trueMissing = missingInSource.filter((k) => !CONFIG.DYNAMIC_KEYS_PREFIXES.some((prefix) => k.startsWith(prefix)))

    if (trueMissing.length > 0) {
      error(`${C.Red}[FAIL] Found keys in code but missing in ${CONFIG.SOURCE_LANG}:${C.Reset}`)
      trueMissing.forEach((k) => {
        console.log(`   - ${C.Bold}${k}${C.Reset} (used in ${keyLocations[k].join(', ')})`)
      })
    } else {
      console.log(`${C.Green}[PASS] All detected keys exist in ${CONFIG.SOURCE_LANG} (some dynamic ignored)${C.Reset}`)
    }
  } else {
    console.log(`${C.Green}[PASS] All detected keys exist in ${CONFIG.SOURCE_LANG}${C.Reset}`)
  }

  // Check 2: Keys in Source but not found in Code (Unused?)
  const unusedInSource = [...sourceKeys].filter((k) => !usedKeys.has(k))
  const unused = unusedInSource.filter((k) => !CONFIG.DYNAMIC_KEYS_PREFIXES.some((prefix) => k.startsWith(prefix)))

  if (unused.length > 0) {
    error(`${C.Red}[FAIL] ${unused.length} keys in ${CONFIG.SOURCE_LANG} NOT found in code (unused):${C.Reset}`)
    unused.sort().forEach((k) => console.log(`   - ${k}`))
  } else {
    console.log(`${C.Green}[PASS] All ${CONFIG.SOURCE_LANG} keys appear to be used${C.Reset}`)
  }

  // Check 3: Dynamic Keys Prefix
  printHeader('4. Checking Dynamic Keys')
  const missingPrefixes = CONFIG.DYNAMIC_KEYS_PREFIXES.filter((prefix) => !foundPrefixes.has(prefix))
  if (missingPrefixes.length > 0) {
    error(`${C.Red}[FAIL] Dynamic keys prefix not found in source code (must be used with 'strings'):${C.Reset}`)
    missingPrefixes.forEach((prefix) => console.log(`   - ${prefix}`))
  } else {
    console.log(`${C.Green}[PASS] All dynamic keys prefixes found in source code${C.Reset}`)
  }

  // Report
  printHeader('Summary')
  if (exitCode !== 0) {
    console.log(`${C.Red}[FAIL] Verification Failed!${C.Reset}`)
    process.exit(1)
  } else {
    console.log(`${C.Green}[PASS] Success! All checks passed.${C.Reset}`)
    process.exit(0)
  }
}

main()
