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

type DominoElement = any

type DownloadKind = 'image' | 'json' | 'media' | 'video' | 'subtitle' | 'module' | 'css' | 'js' | 'data'

type Callback = (err?: any, data?: any, extra?: any) => void
interface KVS<T> {
  [key: string]: T
}

type PageDetail = PageInfo & {
  pages?: PageInfo[]
  thumbnail?: {
    source: string
    height: number
    width: number
  }
  categoryinfo?: CategoryInfo
  categories?: string[]
  coordinates?: string // coordinates.0.lat;coordinates.0.lon
  timestamp?: string // revisions.0.timestamp
  revisionId?: number // revisions.0.revid
  stableRevisionId?: number // flagged.stable_revid (FlaggedRevs)
  internalThumbnailUrl?: string // internalThumbnailUrl
  missing?: string
  pagelang?: string
  pagedir?: TextDirection
  contentmodel?: string
}

type FileToDownload = {
  path: string
  downloadAttempts: number
}

type FileDetail = {
  url: string
  mult?: number
  width?: number
  kind: DownloadKind
}

type PageRedirect = {
  to: PageTitle
  from: PageTitle
  fragment?: string
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
  iterateItems: (numWorkers: number, func: (items: KVS<T>, runningWorkers: number) => Promise<void>) => Promise<void>
  scan: (cursor: number) => Promise<{ cursor: number; items: KVS<T> }>
  flush: () => Promise<number>
}

// RedisStore Interface
interface RS {
  readonly client: any // RedisClientType
  readonly filesStore: RKVS<FileDetail>
  readonly pagesStore: RKVS<PageDetail>
  readonly redirectsStore: RKVS<PageRedirect>
  connect: (populateStores?: boolean) => Promise<void>
  close: () => Promise<void>
  createRedisKvs: (dbName: string, keyMapping?: KVS<string>) => RKVS<any>
}

type QueryCategoriesRet = Array<
  PageInfo & {
    hidden: boolean
  }
>

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

type QueryRedirectsRet = Array<
  PageInfo & {
    fragment?: string
  }
>

type CategoryInfo = {
  size: number
  pages: number
  files: number
  subcats: number
  hidden: boolean
  nogallery: boolean
}

type GroupedCategoryMembers = {
  subcats: Array<CategoryMember>
  pages: Array<CategoryMember>
  files: Array<CategoryMember>
  categoryinfo: CategoryInfo
}

type CategoryMember = PageInfo & {
  sortkeyprefix: string
  type: 'subcat' | 'page' | 'file'
}

type TextDirection = 'ltr' | 'rtl'

interface QueryRet {
  categories?: QueryCategoriesRet
  revisions?: QueryRevisionsRet
  coordinates?: QueryCoordinatesRet
  redirects?: QueryRedirectsRet
  flagged?: {
    stable_revid?: number
  }
  pagelanguagehtmlcode?: string
  pagelanguagedir?: TextDirection
  contentmodel: string

  categoryinfo?: {
    size: number
    pages: number
    files: number
    subcats: number
    hidden: boolean
  }
  pageprops?: {
    nogallery?: ''
  }

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

type QueryMwRet = (PageInfo & QueryRet)[]

interface CustomProcessor {
  shouldKeepPage?: (pageTitle: PageTitle, doc: Document) => Promise<boolean>
  preProcessPage?: (pageTitle: PageTitle, doc: Document) => Promise<Document>
  postProcessPage?: (pageTitle: PageTitle, doc: Document) => Promise<Document>
}

interface MWMetaData {
  langIso2: string
  langIso3: string
  title: string
  subTitle: string
  creator: string
  mainPage: string
  mainPageIsDomainRoot: boolean
  textDir: TextDirection
  langMw: string
  logo: string
  licenseName: string
  licenseUrl: string
  categoryCollation: string

  baseUrl: string
  wikiPath: string
  indexPhpPath: string
  actionApiPath: string
  domain: string
  webUrl: string
  actionApiUrl: string
  webUrlPath: string
  modulePath: string
  modulePathOpt: string
}

interface MWNamespaceData {
  num: number
  allowedSubpages: boolean
}

interface MWNamespaces {
  [namespace: string]: MWNamespaceData
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

interface PageUrlOpts {
  sectionId?: string
  langVar?: string
  oldid?: number
}

interface PageInfo {
  ns?: number
  title: PageTitle
}

type Brand<T, B> = T & { readonly __brand: B }

type ZimPath = Brand<string, 'ZimPath'>
type PageTitle = Brand<string, 'PageTitle'>
type PageId = Brand<string, 'PageId'>

type RenderSingleOutput = {
  pageTitle: PageTitle
  zimPath: ZimPath
  zimTitle: string
  htmlContent: string
}

type RenderOutput = {
  items: RenderSingleOutput[]
  imageDependencies: any
  videoDependencies: any
  mediaDependencies: any
  moduleDependencies: any
  subtitles: any
  needsDownloadErrorStaticFiles: boolean
}

interface GetSiteInfoArgv {
  addNamespaces?: number[]
  onlyNamespaces?: number[]
  mwModulePath?: string
  forceSkin?: string
  langVariants?: string[]
}
