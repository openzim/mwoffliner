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
  customZimTitle?: string
  customZimDescription?: string
  customZimLongDescription?: string
  mainPage?: string
  filenamePrefix?: string
  articleList?: string
  resume?: boolean
  minifyHtml: boolean
  keepEmptyParagraphs: boolean
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
  public isMainPage = (articleId: string): boolean => {
    return this.mwMetaData.mainPage === articleId ? true : false
  }
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
    return flavour.join('_')
  }

  public computeFilenameRadical(withoutSelection?: boolean, withoutFlavour?: boolean, withoutDate?: boolean) {
    let radical
    if (this.opts.filenamePrefix) {
      radical = this.opts.filenamePrefix
    } else {
      radical = `${this.mwMetaData.creator.charAt(0).toLowerCase() + this.mwMetaData.creator.substr(1)}_`
      const hostParts = new URL(this.mwMetaData.webUrl).hostname.split('.')
      let langSuffix = this.mwMetaData.langIso2
      for (const part of hostParts) {
        if (part === this.mwMetaData.langIso3) {
          langSuffix = part
          break
        }
      }
      radical += langSuffix
    }
    if (!withoutSelection && !this.opts.filenamePrefix) {
      if (this.opts.articleList) {
        let filenamePostfix = pathParser
          .basename(this.opts.articleList)
          .toLowerCase()
          .replace(/\.\w{3}$/, '')
          .replace(/[^a-z0-9-]+/g, '-')
        if (filenamePostfix.length > 50) {
          filenamePostfix = filenamePostfix.slice(0, 50)
        }
        radical += `_${filenamePostfix}`
      } else {
        radical += '_all'
      }
    }
    if (!withoutFlavour && this.computeFlavour()) {
      radical += `_${this.computeFlavour()}`
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
