export const requiredParams = ['mwUrl', 'adminEmail']

export const parameterDescriptions = {
  mwUrl: 'MediaWiki base URL (any URL paths appending)',
  adminEmail: 'Email of the MWoffliner operator. Will be put in the HTTP user-agent string for information only',
  articleList: 'List of articles to include. Comma separated list of titles or a local path or HTTP(S) URL to a file with one title (in UTF8) per line',
  articleListToIgnore: 'List of articles to ignore. Comma separated list of titles or local path or HTTP(S) URL to a file with one title (in UTF8) per line',
  customZimFavicon: 'Local path or HTTP(S) URL to a PNG favicon (will be resized to 48x48). Default to MediaWiki if not set',
  customZimTitle: 'ZIM custom title metadata (30 characters max)',
  customZimDescription: 'ZIM custom description (80 characters max)',
  customZimLongDescription: 'ZIM custom long description (4000 characters max)',
  customZimTags: 'ZIM tags metadata (semi-colon separated)',
  customZimLanguage: 'ZIM ISO 639-3 content language code',
  customMainPage: 'Custom page to be used as welcome page.',
  filenamePrefix: 'Part of the ZIM filename which is before the format & date parts.',
  format:
    'Flavour for the scraping. If missing, scrape all article contents. Each --format argument will cause a new local file to be created but options can be combined. Supported options are:\n * novid: no video & audio content\n * nopic: no pictures (implies "novid")\n * nopdf: no PDF files\n * nodet: only the first/head paragraph (implies "novid")\nFlavour can be named (and corresponding ZIM metadata will be created) using a ":":\nExample: "--format=nopic,nodet:mini"',
  keepEmptyParagraphs: 'Keep all sections, even empty ones typically used as placeholders in wikis to outline expected article structure.',
  mwWikiPath: 'MediaWiki article path (by default "/wiki/")',
  mwIndexPhpPath: 'MediaWiki index.php path (by default "/w/index.php")',
  mwActionApiPath: 'MediaWiki API path (by default "/w/api.php")',
  mwRestApiPath: 'MediaWiki REST API path (by default "/w/rest.php")',
  mwModulePath: 'MediaWiki module load path (by default "/w/load.php")',
  mwDomain: 'MediaWiki user domain (thought for private wikis)',
  mwUsername: 'MediaWiki username (thought for private wikis)',
  mwPassword: 'MediaWiki user password (thought for private wikis)',
  minifyHtml: 'Try to reduce the size of the HTML',
  outputDirectory: 'Directory to write the downloaded content',
  publisher: "ZIM publisher meta data, by default 'Kiwix'",
  redis: 'Redis path (redis:// URL or path to UNIX socket)',
  requestTimeout: 'Request timeout in seconds (defaultis 120s)',
  resume: 'Skip already existing/created ZIM files',
  speed: 'Multiplicator for the number of parallel HTTP requests on Parsoid backend (by default the number of CPU cores). The default value is 1.',
  verbose:
    'Print logging information to standard streams. To filter messages, one of the following values can be given: "info", "log", "warn", "error" or "quiet" (default level being "error"). All messages are printed from the given value and higher/worse.',
  withoutZimFullTextIndex: "Don't include a fulltext search index to the ZIM",
  webp: 'Convert all jpeg, png and gif images to webp format',
  addNamespaces: 'Force additional namespace (comma separated numbers)',
  osTmpDir: 'Override default operating system temporary directory path environment variable',
  optimisationCacheUrl: 'Object Storage URL (including credentials and bucket name) to cache optimised media files',
  forceRender:
    'Force the usage of a specific API end-point/render, automatically chosen otherwise. Accepted values: [ VisualEditor, WikimediaDesktop. WikimediaMobile, RestApi, ActionParse ]',
  forceSkin: 'Force the usage of a specific skin, automatically chosen otherwise.',
  langVariant: 'Use a specific language variant, only for wikis supporting language conversion.',
  insecure: 'Skip HTTPS server authenticity verification step',
}

// TODO: Add an interface based on the object above
