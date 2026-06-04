import * as pathParser from 'path'
import { existsSync } from 'fs'
import * as logger from './Logger.js'
import { getStringsForLang } from './util/index.js'

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
  filenamePrefix?: string
  articleList?: string
  resume?: boolean
  minifyHtml: boolean
  keepEmptySections: boolean
  tags?: string
  filenameDate: string
}

export class Dump {
  public customProcessor?: CustomProcessor
  public nopic: boolean
  public novid: boolean
  public nopdf: boolean
  public nodet: boolean
  public opts: DumpOpts
  public strings: KVS<string>
  public mwMetaData: MWMetaData
  public outFile: string
  public maxHardFailedArticles: number = 0
  public status = {
    files: {
      success: 0,
      fail: 0,
    },
    articles: {
      success: 0,
      hardFail: 0,
      hardFailedArticleIds: [],
      softFail: 0,
      softFailedArticleIds: [],
    },
    redirects: {
      written: 0,
    },
  }

  private formatFlavour: string

  constructor(format: string, opts: DumpOpts, mwMetaData: MWMetaData, customProcessor?: CustomProcessor) {
    this.mwMetaData = mwMetaData
    this.opts = opts
    this.customProcessor = customProcessor

    const [formatStr, formatFlavour] = format.split(':')
    this.nopic = formatStr.includes('nopic')
    this.novid = formatStr.includes('novid')
    this.nopdf = formatStr.includes('nopdf')
    this.nodet = formatStr.includes('nodet')
    this.formatFlavour = formatFlavour
    /* Get language specific strings */
    this.strings = getStringsForLang(mwMetaData.langIso2 || 'en', 'en')
  }

  public computeFlavour() {
    const flavour = []
    if (typeof this.formatFlavour === 'string') {
      flavour.push(this.formatFlavour)
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
    let langSuffix = this.mwMetaData.langIso2
    for (const part of hostParts) {
      if (part === this.mwMetaData.langIso3) {
        langSuffix = part
        break
      }
    }
    return langSuffix
  }

  private computeSelection() {
    if (this.opts.articleList) {
      let filenamePostfix = pathParser
        .basename(this.opts.articleList)
        .toLowerCase()
        .replace(/\.\w{3}$/, '')
        .replace(/[^a-z0-9-]+/g, '-')
      if (filenamePostfix.length > 50) {
        filenamePostfix = filenamePostfix.slice(0, 50)
      }
      return filenamePostfix
    }
    return 'all'
  }

  private computePlaceholders(zimName?: string): KVS<string> {
    const flavour = this.computeFlavour()
    const lang = this.computeLang()
    const placeholders: KVS<string> = {
      domain: this.computeDomain(),
      lang,
      lang_or_variant: this.mwMetaData.langVar || lang,
      selection: this.computeSelection(),
      flavour,
      flavour_suffix: flavour ? `_${flavour}` : '',
      period: this.opts.filenameDate,
    }
    return zimName ? { ...placeholders, zim_name: zimName } : placeholders
  }

  private formatTemplate(template: string, placeholders: KVS<string>, optionName: string) {
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

  private checkFilenameRadical(filenameRadical: string, optionName: string) {
    if (filenameRadical.includes('/') || filenameRadical.includes('\\')) {
      throw new Error(`option --${optionName} must be a filename, not a path`)
    }
    if (filenameRadical.endsWith('.zim')) {
      throw new Error(`option --${optionName} must not include the .zim extension`)
    }
  }

  public computeZimName() {
    if (this.opts.customZimName) {
      return this.formatTemplate(this.opts.customZimName, this.computePlaceholders(), 'customZimName')
    }
    if (this.opts.filenamePrefix) {
      return this.opts.filenamePrefix
    }
    const placeholders = this.computePlaceholders()
    return `${placeholders.domain}_${placeholders.lang_or_variant}_${placeholders.selection}`
  }

  public computeFilenameRadical(withoutSelection?: boolean, withoutFlavour?: boolean, withoutDate?: boolean) {
    const placeholders = this.computePlaceholders()

    if (!withoutSelection && !withoutFlavour && !withoutDate && this.opts.customZimFilename) {
      const filenameRadical = this.formatTemplate(this.opts.customZimFilename, { ...placeholders, zim_name: this.computeZimName() }, 'customZimFilename')
      this.checkFilenameRadical(filenameRadical, 'customZimFilename')
      return filenameRadical
    }

    let radical
    if (this.opts.filenamePrefix) {
      radical = this.opts.filenamePrefix
    } else {
      radical = `${placeholders.domain}_${placeholders.lang_or_variant}`
    }
    if (!withoutSelection && !this.opts.filenamePrefix) {
      radical += `_${placeholders.selection}`
    }
    if (!withoutFlavour && placeholders.flavour) {
      radical += `_${placeholders.flavour}`
    }
    if (!withoutDate) {
      radical += `_${this.opts.filenameDate}`
    }
    return radical
  }

  public checkResume() {
    if (this.opts.resume) {
      const zimPath = this.computeZimRootPath()
      if (existsSync(zimPath)) {
        logger.log(`${zimPath} is already done, skip dumping & ZIM file generation`)
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

  public computeZimRootPath() {
    let zimRootPath = this.opts.outputDirectory[0] === '/' ? this.opts.outputDirectory : `${pathParser.resolve(process.cwd(), this.opts.outputDirectory)}/`
    zimRootPath += `${this.computeFilenameRadical()}.zim`
    return zimRootPath
  }
}
