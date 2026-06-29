import * as pathParser from 'path'
import { existsSync } from 'fs'
import * as logger from './Logger.js'
import { type Translator } from './i18n.js'

interface DumpOpts {
  tmpDir: string
  username: string
  password: string
  outputDirectory: string
  publisher: string
  withoutZimFullTextIndex: boolean
  customZimTags?: string
  customZimLanguage?: string
  customZimName?: string
  customZimTitle?: string
  customZimDescription?: string
  customZimLongDescription?: string
  customZimFilename?: string
  mainPage?: string
  pageList?: string
  resume?: boolean
  minifyHtml: boolean
  keepEmptySections: boolean
  tags?: string
  filenameDate: string
  stableRevision?: boolean
}

export class Dump {
  public customProcessor?: CustomProcessor
  public nopic: boolean
  public novid: boolean
  public nopdf: boolean
  public nodet: boolean
  public langVar: string
  public opts: DumpOpts
  public t: Translator
  public mwMetaData: MWMetaData
  public outFile: string
  public maxHardFailedPages: number = 0
  public status = {
    files: {
      success: 0,
      fail: 0,
    },
    pages: {
      success: 0,
      hardFail: 0,
      hardFailedPages: [],
      softFail: 0,
      softFailedPages: [],
    },
    redirects: {
      written: 0,
    },
  }

  private formatFlavour: string

  constructor(format: string, langVar: string, opts: DumpOpts, mwMetaData: MWMetaData, customProcessor: CustomProcessor | undefined, t: Translator) {
    this.mwMetaData = mwMetaData
    this.opts = opts
    this.customProcessor = customProcessor

    const [formatStr, formatFlavour] = format.split(':')
    this.nopic = formatStr.includes('nopic')
    this.novid = formatStr.includes('novid')
    this.nopdf = formatStr.includes('nopdf')
    this.nodet = formatStr.includes('nodet')
    this.formatFlavour = formatFlavour
    this.langVar = langVar
    this.t = t
  }

  public computeFlavour() {
    const flavour = []
    if (typeof this.formatFlavour === 'string') {
      return this.formatFlavour
    } else {
      if (this.nopic) {
        flavour.push('nopic')
      } else if (this.nopdf) {
        flavour.push('nopdf')
      } else if (this.novid && !this.nodet) {
        flavour.push('novid')
      }

      if (this.nodet) {
        flavour.push('nodet')
      }
    }
    return flavour.join('-')
  }

  private computeDomain() {
    return this.mwMetaData.creator.charAt(0).toLowerCase() + this.mwMetaData.creator.substr(1)
  }

  private computeLang() {
    const hostParts = new URL(this.mwMetaData.webUrl).hostname.split('.')
    let lang = this.mwMetaData.langIso2
    for (const part of hostParts) {
      if (part === this.mwMetaData.langIso3) {
        lang = part
        break
      }
    }
    return lang
  }

  private computeSelection() {
    if (this.opts.pageList) {
      let selection = pathParser
        .basename(this.opts.pageList)
        .toLowerCase()
        .replace(/\.\w{3}$/, '')
        .replace(/[^a-z0-9-]+/g, '-')
      if (selection.length > 50) {
        selection = selection.slice(0, 50)
      }
      return selection
    }
    return 'all'
  }

  private computeNamePlaceholders(): KVS<string> {
    const lang = this.computeLang()
    const placeholders: KVS<string> = {
      domain: this.computeDomain(),
      lang,
      lang_or_variant: this.langVar || lang,
      selection: this.computeSelection(),
    }
    return placeholders
  }

  private computeFilenamePlaceholders(): KVS<string> {
    const placeholders: KVS<string> = {
      ...this.computeNamePlaceholders(),
      flavour: this.computeFlavour(),
      period: this.opts.filenameDate,
    }
    return placeholders
  }

  private formatTemplate(template: string, placeholders: KVS<string>, optionName: string) {
    logger.warn(template)
    const formatted = template.replace(/\{([^{}]+)\}/g, (match, key) => {
      if (typeof placeholders[key] !== 'string') {
        const validPlaceholders = Object.keys(placeholders).sort().join(', ')
        throw new Error(`Invalid placeholder ${match} in option --${optionName}. Valid placeholders are: ${validPlaceholders}`)
      }
      return placeholders[key]
    })
    if (/[{}]/.test(formatted)) {
      const validPlaceholders = Object.keys(placeholders).sort().join(', ')
      throw new Error(`Invalid placeholder in option --${optionName}. Valid placeholders are: ${validPlaceholders}`)
    }
    return formatted
  }

  public computeZimName() {
    const nameTemplate = this.opts.customZimName || '{domain}_{lang_or_variant}_{selection}'
    return this.formatTemplate(nameTemplate, this.computeNamePlaceholders(), 'customZimName')
  }

  public computeFilename() {
    const filenameTemplate = this.opts.customZimFilename
      ? this.opts.customZimFilename
      : this.formatFlavour || (this.formatFlavour === undefined && (this.nodet || this.nopdf || this.nopic || this.novid))
        ? '{zim_name}_{flavour}_{period}.zim'
        : '{zim_name}_{period}.zim'
    const filename = this.formatTemplate(filenameTemplate, { ...this.computeFilenamePlaceholders(), zim_name: this.computeZimName() }, 'customZimFilename')
    if (filename.includes('/') || filename.includes('\\')) {
      throw new Error(`option --customZimFilename must be a filename, not a path`)
    }
    if (!filename.endsWith('.zim')) {
      throw new Error(`option --customZimFilename must include the .zim extension`)
    }
    return filename
  }

  public checkResume() {
    if (this.opts.resume) {
      const zimPath = this.computeZimFullPath()
      if (existsSync(zimPath)) {
        logger.info(`${zimPath} is already done, skip dumping & ZIM file generation`)
        throw new Error('TODO: IMPLEMENT RESUME')
      }
    }
  }

  public computeZimTags() {
    /* Add tag and avoid duplicates */
    function addTagWithoutDuplicate(newTag: string) {
      if (!tags.find((tag) => tag === newTag)) {
        tags.push(newTag)
      }
    }

    /* Split tags in a list */
    let tags = (this.opts.tags || '').split(';')

    /* Add Mediawiki hostname radical as a tag */
    const mwUrlHostParts = new URL(this.mwMetaData.baseUrl).host.split('.')
    const mwUrlHostPartsRadical = mwUrlHostParts.length > 1 ? mwUrlHostParts[mwUrlHostParts.length - 2] : mwUrlHostParts[mwUrlHostParts.length - 1]
    const mwUrlHostPartsTag = mwUrlHostPartsRadical.toLowerCase()
    addTagWithoutDuplicate(mwUrlHostPartsTag)

    /* Famous Web sites have their own hidden category */
    if (mwUrlHostPartsTag.match(/^(gutenberg|phet|psiram|stack_exchange|ted|vikidia|wikibooks|wikinews|wikipedia|wikiquote|wikisource|wikiversity|wikivoyage|wiktionary)$/)) {
      addTagWithoutDuplicate('_category:' + mwUrlHostPartsTag)
    }

    /* Add --format tags */
    if (this.nopic) {
      addTagWithoutDuplicate('_pictures:no')
      addTagWithoutDuplicate('_videos:no')
    } else if (this.novid) {
      addTagWithoutDuplicate('_pictures:yes')
      addTagWithoutDuplicate('_videos:no')
    }
    if (this.nodet) {
      addTagWithoutDuplicate('_videos:no')
      addTagWithoutDuplicate('_details:no')
    } else {
      addTagWithoutDuplicate('_details:yes')
    }

    /* Add proper _ftindex tag */
    addTagWithoutDuplicate('_ftindex:' + (this.opts.withoutZimFullTextIndex ? 'no' : 'yes'))

    /* Remove empty tags */
    tags = tags.filter((x) => x)
    return tags.join(';')
  }

  public computeZimFullPath() {
    let zimFullPath = this.opts.outputDirectory[0] === '/' ? this.opts.outputDirectory : `${pathParser.resolve(process.cwd(), this.opts.outputDirectory)}`
    if (!zimFullPath.endsWith('/')) {
      zimFullPath += '/'
    }
    zimFullPath += this.computeFilename()
    return zimFullPath
  }
}
