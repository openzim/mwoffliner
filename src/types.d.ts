declare module 'follow-redirects'
declare module '*.json' {
  const value: any
  // noinspection JSDuplicatedDeclaration
  export default value
}
declare module 'utf8-binary-cutter'
declare module 'expand-home-dir'
declare module 'swig-templates'
declare module 'mkdirp'
declare module 'imagemin-advpng'
declare module 'imagemin-jpegoptim'
declare module 'imagemin-webp'

type DominoElement = any

type DonwloadKind = 'image' | 'json' | 'media' | 'video' | 'subtitle' | 'module' | 'css' | 'data'

type Callback = (err?: any, data?: any, extra?: any) => void
interface KVS<T> {
  [key: string]: T
}

type ArticleDetail = PageInfo & {
  subCategories?: PageInfo[]
  categories?: PageInfo[]
  pages?: PageInfo[]
  thumbnail?: {
    source: string
    height: number
    width: number
  }
  coordinates?: string // coordinates.0.lat;coordinates.0.lon
  timestamp?: string // revisions.0.timestamp
  revisionId?: number // revisions.0.revid
  internalThumbnailUrl?: string // internalThumbnailUrl
  nextArticleId?: string
  prevArticleId?: string
  missing?: string
}

type FileDetail = {
  url: string
  namespace?: string
  mult?: number
  width?: number
  kind: DonwloadKind
}

type ArticleRedirect = {
  targetId: string
  title: string
}

// RedisKvs interface
interface RKVS<T> {
  get: (prop: string) => Promise<T>
  getMany: (prop: string[]) => Promise<KVS<T>>
  exists: (prop: string) => Promise<boolean>
  existsMany: (prop: string[], blocking?: boolean) => Promise<KVS<boolean>>
  set: (prop: string, val: T) => Promise<number>
  setMany: (val: KVS<T>) => Promise<number>
  delete: (prop: string) => Promise<number>
  deleteMany: (prop: string[]) => Promise<number>
  keys: () => Promise<string[]>
  len: () => Promise<number>
  iterateItems: (numWorkers: number, func: (items: KVS<T>, run: number) => Promise<void>) => Promise<void>
  scan: (cursor: number) => Promise<{ cursor: number; items: KVS<T> }>
  flush: () => Promise<number>
}

// RedisStore Interface
interface RS {
  readonly client: any // RedisClientType
  readonly filesToDownloadXPath: RKVS<FileDetail>
  readonly filesToRetryXPath: RKVS<FileDetail>
  readonly articleDetailXId: RKVS<ArticleDetail>
  readonly redirectsXId: RKVS<ArticleRedirect>
  connect: (populateStores?: boolean) => Promise<void>
  close: () => Promise<void>
  createRedisKvs: (dbName: string, keyMapping?: KVS<string>) => RKVS<any>
}

type QueryCategoriesRet = PageInfo[]

type QueryRevisionsRet = Array<{
  revid: number
  parentid: number
  minor: string
  user: string
  timestamp: string
  comment: string
}>

type QueryCoordinatesRet = Array<{
  lat: number
  lon: number
  primary: string
  globe: string
}>

type QueryRedirectsRet = PageInfo[]

type TextDirection = 'ltr' | 'rtl'

interface QueryRet {
  subCategories?: PageInfo[] // :(
  categories?: QueryCategoriesRet
  revisions?: QueryRevisionsRet
  coordinates?: QueryCoordinatesRet
  redirects?: QueryRedirectsRet

  thumbnail?: {
    source: string
    width: number
    height: number
  }

  missing?: string
}

interface MwApiQueryResponse {
  normalized?: Array<{ from: string; to: string }>
  pages: {
    [pageId: string]: PageInfo & QueryRet
  }
}

interface MwApiResponse {
  batchcomplete: boolean
  query: MwApiQueryResponse
  continue?: {
    [key: string]: string
  }
  'query-continue'?: QueryContinueOpts
  warnings?: {
    [key: string]: {
      [key: string]: string
    }
  }
  error?: any
}

interface QueryMwRet {
  [articleId: string]: PageInfo & QueryRet
}

interface CustomProcessor {
  shouldKeepArticle?: (articleId: string, doc: Document) => Promise<boolean>
  preProcessArticle?: (articleId: string, doc: Document) => Promise<Document>
  postProcessArticle?: (articleId: string, doc: Document) => Promise<Document>
}

interface MWMetaData {
  langIso2: string
  langIso3: string
  title: string
  subTitle: string
  creator: string
  mainPage: string
  textDir: TextDirection

  baseUrl: string
  wikiPath: string
  actionApiPath: string
  restApiPath: string
  domain: string
  webUrl: string
  actionApiUrl: string
  restApiUrl: string
  webUrlPath: string
  modulePath: string
  modulePathOpt: string
  mobileModulePath: string
}

interface MWNamespaces {
  [namespace: string]: {
    num: number
    allowedSubpages: boolean
    isContent: boolean
  }
}

interface MWConfig {
  base: string
  wikiPath?: string
  actionApiPath?: string
  domain?: string
  username?: string
  password?: string
  modulePath?: string
  getCategories?: boolean
}

interface ContinueOpts {
  rdcontinue?: string
  continue?: string
  // ...
}

interface QueryContinueOpts {
  categories: {
    clcontinue: string
  }
  coordinates: {
    cocontinue: string
  }
  allpages: {
    gapcontinue: string
  }
  redirects: {
    rdcontinue: string
  }
  pageimages: {
    picontinue: string
  }
}

interface PageInfo {
  ns?: number
  title: string
}

interface PageRef {
  name: string
  url: string
}

interface RenderedArticle {
  articleId: string
  displayTitle: string
  html: string
}
