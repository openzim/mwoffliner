export const requiredParams = ['mwUrl', 'adminEmail']

export const parameterDescriptions = {
  mwUrl: 'Mediawiki base URL.',
  adminEmail: 'Email of the mwoffliner user which will be put in the HTTP user-agent string',
  articleList: 'List of articles to include. Can be a comma seperated list of titles or a local path or http(s) URL to a file with one title (in UTF8) per line',
  articleListToIgnore: 'List of articles to ignore. Can be a comma seperated list of titles or a local path or http(s) URL to a file with one title (in UTF8) per line',
  customZimFavicon: 'Use this option to give a path to a PNG favicon, it will be used in place of the Mediawiki logo. This can be a local path or an HTTP(S) url',
  customZimTitle: 'Allow to configure a custom ZIM file title.',
  customZimDescription: 'Allow to configure a custom ZIM file description. Max length is 80 chars.',
  customZimLongDescription: 'Allow to configure a custom ZIM file long description. Max length is 4000 chars.',
  customZimTags: 'Allow to configure custom ZIM file tags (semi-colon separated).',
  customZimLanguage: 'Allow to configure a custom ISO639-3 content language code.',
  customMainPage: 'Allow to configure a custom page as welcome page.',
  filenamePrefix: 'For the part of the ZIM filename which is before the format & date parts.',
  format:
    'Specify a flavour for the scraping. If missing, scrape all article contents. Each --format argument will cause a new local file to be created but options can be combined. Supported options are:\n * novid: no video & audio content\n * nopic: no pictures (implies "novid")\n * nopdf: no PDF files\n * nodet: only the first/head paragraph (implies "novid")\nFormat names can also be aliased using a ":"\nExample: "... --format=nopic:mini --format=novid,nopdf"',
  keepEmptyParagraphs: 'Keep all paragraphs, even empty ones.',
  mwWikiPath: 'Mediawiki wiki base path (per default "/wiki/")',
  mwApiPath: 'Mediawiki API path (per default "/w/api.php")',
  mwModulePath: 'Mediawiki module load path (per default "/w/load.php")',
  mwDomain: 'Mediawiki user domain (thought for private wikis)',
  mwUsername: 'Mediawiki username (thought for private wikis)',
  mwPassword: 'Mediawiki user password (thought for private wikis)',
  minifyHtml: 'Try to reduce the size of the HTML',
  outputDirectory: 'Directory to write the downloaded content',
  publisher: "ZIM publisher meta data, per default 'Kiwix'",
  redis: 'Redis path (redis:// URL or path to UNIX socket)',
  requestTimeout: 'Request timeout - in seconds(default value is 120 seconds)',
  resume: 'Do not overwrite if ZIM file already created',
  speed: 'Multiplicator for the number of parallel HTTP requests on Parsoid backend (per default the number of CPU cores). The default value is 1.',
  verbose:
    'Print information to the stdout if the level is "info" or "log", and to the stderr, if the level is warn or error. The option can be empty or one of "info", "log", "warn", "error", or "quiet". Option with an empty value is equal to "info".The default level is "error". If you choose the lower level then you will see messages also from the more high levels. For example, if you use warn then you will see warnings and errors.',
  withoutZimFullTextIndex: "Don't include a fulltext search index to the ZIM",
  webp: 'Convert all jpeg, png and gif images to webp format',
  addNamespaces: 'Force additional namespace (comma separated numbers)',
  getCategories: '[WIP] Download category pages',
  osTmpDir: 'Override default operating system temporary directory path environment variable',
  customFlavour: 'A custom processor that can filter and process articles (see extensions/*.js)',
  optimisationCacheUrl: 'S3 url, including credentials and bucket name',
  forceRender:
    'Force the usage of a specific API end-point/render, automatically chosen otherwise. Accepted values: [ VisualEditor, WikimediaDesktop. WikimediaMobile ]. More details at https://github.com/openzim/mwoffliner/wiki/API-end-points',
}

// TODO: Add an interface based on the object above
